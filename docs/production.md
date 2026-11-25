# Verificación local de la pila de producción

Procedimiento para arrancar `docker-compose.prod.yml` en la máquina de desarrollo y comprobar
que se comporta como en producción. Caddy es el único servicio que publica puertos (80 y 443);
todo lo demás vive en la red interna. Las comprobaciones usan `recipes.local` y el certificado
interno de Caddy, así que no hace falta DNS ni confiar en la CA si se usa `curl -k --resolve`.

## 1. Preparación (una sola vez)

Necesitas Node.js 22, Docker con Compose y `openssl`.

Si prefieres no pasar `--resolve` en cada `curl`, añade el host a `/etc/hosts` y confía en la CA
de Caddy para el navegador:

```sh
echo '127.0.0.1 recipes.local' | sudo tee -a /etc/hosts
docker compose -f docker-compose.prod.yml up -d caddy
docker compose -f docker-compose.prod.yml cp caddy:/data/caddy/pki/authorities/local/root.crt caddy-root.crt
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain caddy-root.crt  # macOS
```

La pila necesita ocho ficheros en `secrets/` y un `.env` sin secretos. La lista completa y las
reglas de rotación están en [`secrets/README.md`](../secrets/README.md):

```sh
cp .env.production.example .env

gen() { openssl rand -base64 48 | tr -d '/+=' | head -c 40; }
mp=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
rp=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
printf '%s' "$mp" > secrets/mongo_root_password.txt
printf 'mongodb://recipes:%s@mongo:27017/recipes?authSource=admin&replicaSet=rs0' "$mp" > secrets/mongo_url.txt
printf '%s' "$rp" > secrets/redis_password.txt
printf 'redis://:%s@redis:6379' "$rp" > secrets/redis_url.txt
printf 'recipesadmin' > secrets/minio_root_user.txt
gen > secrets/minio_root_password.txt
gen > secrets/jwt_access_secret.txt
gen > secrets/jwt_refresh_secret.txt
```

Los caracteres `/`, `+` y `=` se quitan porque las contraseñas se interpolan dentro de URLs.
`NEXT_PUBLIC_API_URL` debe seguir sin definirse: el cliente de Socket.IO usa el origen de la
página, que es el mismo que sirve Caddy.

## 2. Arrancar

```sh
docker compose -f docker-compose.prod.yml up -d --build --wait
```

`--wait` espera a que todos los healthchecks estén `healthy` y falla si alguno no llega. Es
normal ver dos servicios terminados con código 0: `mongo-keyfile` (genera el keyfile una vez) y
`minio-init` (crea el bucket privado `media` e importa la regla de ciclo de vida de
`infra/minio/lifecycle.json`, que expira las subidas sin confirmar de `pending/` al día
siguiente; el import reemplaza la configuración del bucket, así que es idempotente).

```sh
docker compose -f docker-compose.prod.yml ps -a
```

### 2.1 Actualizar una instalación existente

Los hogares creados antes de que existiera `timeZone` no tienen el campo. La migración los
rellena con `UTC` (la zona con la que se calculaba la semana hasta ahora) y es idempotente: solo
toca documentos sin campo, así que se puede ejecutar en cada despliegue.

```sh
docker compose -f docker-compose.prod.yml exec backend npm run migrate -w backend
```

La zona se puede indicar al crear el hogar (`POST /api/households` con `timeZone`, una zona IANA
como `America/Bogota`). Los hogares nuevos sin zona usan `UTC`.

## 3. Comprobaciones

### 3.1 Rutas de Caddy

```sh
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' -H 'Host: recipes.local' http://127.0.0.1/
curl -ksS --resolve recipes.local:443:127.0.0.1 https://recipes.local/api/health
curl -ksS --resolve recipes.local:443:127.0.0.1 -o /dev/null -w '%{http_code}\n' https://recipes.local/
curl -ksS --resolve recipes.local:443:127.0.0.1 'https://recipes.local/socket.io/?EIO=4&transport=polling'
curl -ksS --resolve recipes.local:443:127.0.0.1 -o /dev/null -w '%{http_code}\n' https://recipes.local/media/smoke-test.txt
```

Esperado:

| Comprobación       | Resultado                                                       |
| ------------------ | --------------------------------------------------------------- |
| HTTP               | `308` → `https://recipes.local/`                                |
| `/api/health`      | `{"status":"ok", ...}` con `mongo`, `redis` y `storage` en `up` |
| `/`                | `200` (Next.js standalone)                                      |
| `/socket.io`       | handshake Engine.IO (`0{"sid":...}`)                            |
| `/media` sin firma | `403`: el bucket es privado, solo se lee con URL prefirmada     |

### 3.2 URLs prefirmadas en `/media`

La firma SigV4 se calcula sobre la ruta completa, por lo que Caddy **no reescribe** `/media`.
Este chequeo es el que detecta un `SignatureDoesNotMatch` si alguien cambia el `Caddyfile`.

```sh
TMP=$(mktemp -d)
node --input-type=module <<'EOF' > "$TMP/urls"
import { readFileSync } from 'node:fs';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const accessKeyId = readFileSync('secrets/minio_root_user.txt', 'utf8').trim();
const secretAccessKey = readFileSync('secrets/minio_root_password.txt', 'utf8').trim();
const client = new S3Client({
  endpoint: 'https://recipes.local',
  region: 'us-east-1',
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
});
const key = 'smoke-test.txt';
console.log(
  await getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: 'media', Key: key, ContentType: 'text/plain' }),
    { expiresIn: 300 },
  ),
);
console.log(
  await getSignedUrl(client, new GetObjectCommand({ Bucket: 'media', Key: key }), {
    expiresIn: 300,
  }),
);
EOF
{ read -r PUT_URL; read -r GET_URL; } < "$TMP/urls"
curl -ksS --resolve recipes.local:443:127.0.0.1 -X PUT \
  -H 'Content-Type: text/plain' --data 'smoke-ok' -o /dev/null -w 'PUT %{http_code}\n' "$PUT_URL"
curl -ksS --resolve recipes.local:443:127.0.0.1 "$GET_URL"
rm -rf "$TMP"
```

Esperado: `PUT 200` y el cuerpo `smoke-ok`. La ruta firmada es
`https://recipes.local/media/smoke-test.txt` (bucket `media`, `forcePathStyle`).

### 3.3 Autenticación de Mongo y Redis

`hello` es una de las pocas órdenes que Mongo permite sin autenticar, así que hay que probar una
orden privilegiada:

```sh
docker compose -f docker-compose.prod.yml exec -T mongo \
  mongosh --quiet --eval 'db.adminCommand({ listDatabases: 1 })'   # falla: requires authentication
mp=$(cat secrets/mongo_root_password.txt)
docker compose -f docker-compose.prod.yml exec -T mongo \
  mongosh --quiet -u recipes -p "$mp" --authenticationDatabase admin \
  --eval 'print("replica=" + rs.status().set + " primary=" + db.hello().isWritablePrimary)'

docker compose -f docker-compose.prod.yml exec -T redis redis-cli ping  # NOAUTH
rp=$(cat secrets/redis_password.txt)
docker compose -f docker-compose.prod.yml exec -T redis \
  redis-cli --no-auth-warning -a "$rp" ping                             # PONG
```

Esperado: `replica=rs0 primary=true` y `PONG`.

### 3.4 Usuario no root y límites

```sh
for img in recipes-backend:prod recipes-frontend:prod; do
  docker run --rm --entrypoint sh "$img" -c 'id -un; id -u'
done
for svc in backend worker frontend; do
  cid=$(docker compose -f docker-compose.prod.yml ps -q "$svc")
  docker inspect -f '{{.HostConfig.Memory}} {{.Config.StopTimeout}}' "$cid"
done
```

Esperado: `node` / `1000` en ambas imágenes. Memoria y `StopTimeout` (en bytes y segundos):

| Servicio   | `mem_limit` | `max-old-space-size` | `stop_grace_period` |
| ---------- | ----------- | -------------------- | ------------------- |
| `backend`  | 536870912   | 384                  | 30                  |
| `worker`   | 1073741824  | 768                  | 30                  |
| `frontend` | 536870912   | 384                  | —                   |

### 3.5 Apagado ordenado

En el worker los trabajos en curso terminan antes de cortar Redis y Mongo; en la API se cierra
primero Socket.IO. El orden se comprueba en los logs tras un `SIGTERM`:

```sh
docker compose -f docker-compose.prod.yml kill -s SIGTERM worker
sleep 3
docker compose -f docker-compose.prod.yml logs --no-color worker | grep 'cerrado en'
```

Esperado en el worker: `BullMQ workers` → `Redis` → `MongoDB`, y el contenedor termina con
código 0. En la API: `Socket.IO` → `Redis` → `MongoDB`.

El comportamiento con `X-Forwarded-For` (solo se confía en la red de Caddy, para que el
rate limiting use la IP real del cliente) se comprueba con el test e2e, no hace falta levantar
la pila:

```sh
npm run test:e2e --workspace=backend -- trust-proxy.e2e-spec.ts
```

## 4. Parar y limpiar

```sh
docker compose -f docker-compose.prod.yml down -v --remove-orphans
rm -f secrets/*.txt .env caddy-root.crt
```

`-v` borra los volúmenes: datos de Mongo, Redis, MinIO y la CA de Caddy. Sin `-v` se conservan
para la próxima verificación.

## 5. Fallos habituales

- **`SignatureDoesNotMatch` en `/media`**: alguien reescribió la ruta en el `Caddyfile`. El
  prefijo `/media` debe llegar intacto a MinIO.
- **`TRUST_PROXY` con otra subred**: el valor por defecto es `172.16.0.0/12`, el rango de los
  bridges de Docker donde Caddy se conecta a la API. Si tu daemon usa otra subred, ajusta la
  variable en `.env`; nunca la pongas a `true`.
- **El navegador no confía en el certificado**: usa `curl -k` o importa
  `caddy:/data/caddy/pki/authorities/local/root.crt` como CA de confianza.
- **El worker no termina limpio**: debe usar `enableShutdownHooks([], { useProcessExit: true })`
  para que pino vacíe sus buffers antes de `process.exit()`.
- **`up --wait` devuelve 1 aunque todo esté `healthy`**: algunas versiones de Compose tratan la
  terminación de los servicios de una sola vez (`mongo-keyfile`, `minio-init`) como un fallo.
  Usa `up -d` y espera a los healthchecks de `backend` y `frontend`, como hace el job de CI.
