# Secretos locales

Esta carpeta guarda los ficheros de secretos para desarrollo y para la pila de producción
local. **Nada de lo que va aquí se versiona**: `.gitignore` ignora `secrets/*.txt` (y todo
`.env*` salvo los `.example`).

## Uso

- Crea un fichero por secreto, con una sola línea y sin comillas: p. ej. `secrets/jwt_access_secret.txt`.
- Las variables de entorno dobles (`*_FILE`) apuntan a la ruta del fichero; la forma preferida
  es montarlo como Docker secret y leer `JWT_ACCESS_SECRET_FILE=/run/secrets/jwt_access_secret`.
- Si existen las dos formas, el valor plano (`JWT_ACCESS_SECRET`) gana sobre el fichero
  (`JWT_ACCESS_SECRET_FILE`).
- Los valores de ejemplo y la lista completa de variables viven en `.env.example` y
  `.env.production.example`; nunca pongas valores reales en esos ficheros.

## Pila de producción

`docker-compose.prod.yml` necesita estos ocho ficheros, todos en una sola línea y sin
comillas. Ninguno se versiona:

| Fichero                   | Contenido                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------ |
| `mongo_root_password.txt` | contraseña del usuario root de Mongo                                                 |
| `mongo_url.txt`           | `mongodb://recipes:<contraseña>@mongo:27017/recipes?authSource=admin&replicaSet=rs0` |
| `redis_password.txt`      | contraseña de Redis                                                                  |
| `redis_url.txt`           | `redis://:<contraseña>@redis:6379`                                                   |
| `minio_root_user.txt`     | access key de MinIO (la usa también la API como `S3_ACCESS_KEY`)                     |
| `minio_root_password.txt` | secret key de MinIO (la usa también la API como `S3_SECRET_KEY`)                     |
| `jwt_access_secret.txt`   | al menos 32 caracteres                                                               |
| `jwt_refresh_secret.txt`  | al menos 32 caracteres, distinto del anterior                                        |

Genera los valores con `openssl rand -base64 48`. Las contraseñas que se interpolen dentro
de una URL no pueden llevar caracteres reservados (`@`, `:`, `/`, `?`, `#`); si cambias una
contraseña, actualiza también su fichero de URL.

Ejemplo para Mongo:

```sh
password=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
printf '%s' "$password" > secrets/mongo_root_password.txt
printf 'mongodb://recipes:%s@mongo:27017/recipes?authSource=admin&replicaSet=rs0' "$password" > secrets/mongo_url.txt
```

## Reglas

- Sin secretos en el código, en el `README`, en los tests ni en los fixtures.
- Un secreto por fichero, sin espacios ni saltos de línea extra.
- No los compartas por chat ni por correo; usa un gestor de contraseñas.
- Si un secreto se filtra, rótalo y revoca las sesiones o credenciales afectadas.
