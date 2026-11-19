# Recipe Planner

Recipe Planner es la aplicación de cocina de un hogar compartido: las personas que viven juntas
guardan sus recetas en un único sitio, con foto, ingredientes, pasos y raciones, en lugar de
tenerlas repartidas entre capturas de pantalla, enlaces y notas sueltas. Cada receta pertenece a
un hogar, así que quien entra a la casa encuentra la colección común desde el primer día, y puede
importar una receta desde una URL para traerla con sus ingredientes ya estructurados en lugar de
copiarla a mano.

Sobre esa colección se apoya la semana: se asigna una receta a cada comida del calendario, se
escalan las raciones y se genera una lista de la compra que agrega los ingredientes de todo el
plan, descuenta lo que ya hay en la despensa y se comparte en tiempo real. Cuando alguien marca un
ítem en el supermercado, el resto de los móviles del hogar lo ve al instante, sin recargar ni
pisarse entre ellos.

## Stack

| Pieza          | Tecnología                                                                                                                                    | Qué se practica                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Runtime        | Node.js 22 + TypeScript                                                                                                                       |                                                                                            |
| Framework      | NestJS 12 (adaptador **Fastify**)                                                                                                             | Módulos, providers, guards, pipes, interceptors                                            |
| Base de datos  | **MongoDB 7** (replica set de un nodo) + Mongoose                                                                                             | Documentos, índices, transacciones multi-documento                                         |
| Caché / colas  | Redis 7 + **BullMQ** (`@nestjs/bullmq`)                                                                                                       | Trabajos en segundo plano con reintentos                                                   |
| Archivos       | **MinIO** (compatible con S3) + URLs prefirmadas                                                                                              | Subidas directas desde el navegador                                                        |
| Validación     | `class-validator` + `class-transformer` (`ValidationPipe` global)                                                                             |                                                                                            |
| Auth           | Email + contraseña (`argon2`) + **JWT de acceso corto + refresh token rotatorio** con detección de reutilización, ambos en cookies `httpOnly` | Sesiones que sobreviven a la caducidad del access token sin guardar tokens en el navegador |
| Tiempo real    | Socket.IO (`@nestjs/websockets`) con adaptador de Redis                                                                                       | Salas por hogar                                                                            |
| Docs API       | `@nestjs/swagger`                                                                                                                             |                                                                                            |
| Rate limiting  | `@nestjs/throttler` con almacenamiento en Redis                                                                                               |                                                                                            |
| Logging        | `nestjs-pino`                                                                                                                                 |                                                                                            |
| Tests backend  | Vitest + Supertest + Testcontainers (Mongo y Redis)                                                                                           |                                                                                            |
| Frontend       | **Next.js 15** (App Router, React Server Components, Server Actions) + React 19 + Tailwind 4                                                  | SSR y streaming                                                                            |
| Estado cliente | TanStack Query solo en las partes interactivas                                                                                                |                                                                                            |
| Tests frontend | Vitest + React Testing Library                                                                                                                |                                                                                            |
| E2E            | Playwright                                                                                                                                    |                                                                                            |
| Contenedores   | Docker Compose (dev, test, e2e, prod con `output: 'standalone'`)                                                                              |                                                                                            |

## Capas de prueba

Cuatro capas de testing, desde unitarios hasta integración completa con contenedores:

| Capa                  | Comandos                                          | Descripción                                                                                                                                         |
| --------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unit tests**        | `npm run test:unit`                               | Tests unitarios con Vitest, 30 tests en 4 archivos. Umbrales: 80% líneas, ramas, functions, statements. Cobertura en `coverage/unit/`.              |
| **E2E tests**         | `npm run test:e2e`                                | Tests e2e/integration con Vitest + Supertest + Testcontainers. 89 tests en 16 archivos. Umbrales: 80% cobertura. Cobertura en `coverage/`.          |
| **Integration tests** | `npm run test:integration`                        | Tests de integración con infraestructura real (Testcontainers/Docker). 6 tests en 2 archivos. Requieren Docker.                                     |
| **API contract**      | `npm run test:openapi` / `npm run export:openapi` | Validación del contrato OpenAPI. Genera/actualiza `src/openapi.json` y compara con `.vitest.openapi.snapshot.json`. Fallece si el contrato diverge. |

## Arranque

Requisitos: Node.js 22 y Docker con Compose (el repo usa OrbStack o Docker Desktop).

```bash
cp .env.example .env   # ajusta los secretos: los JWT necesitan 32+ caracteres
make up                # o: docker compose up --build --detach --wait
```

La primera vez se construyen las imágenes y se inicializan Mongo, MinIO y el bucket `recipes`.
Cuando el comando termina, la app está en <http://localhost:3001>.

| Servicio             | Puerto | Para qué                                                     |
| -------------------- | ------ | ------------------------------------------------------------ |
| Frontend (Next.js)   | 3001   | la aplicación                                                |
| API (NestJS/Fastify) | 3000   | rutas bajo `/api`                                            |
| MongoDB              | 27017  | base de datos con el replica set `rs0` (transacciones)       |
| Redis                | 6379   | caché, colas de BullMQ y adaptador de Socket.IO              |
| MinIO API (S3)       | 9000   | subidas directas y URLs prefirmadas                          |
| MinIO consola        | 9001   | consola web del almacenamiento (<http://localhost:9001>)     |
| Mailpit SMTP         | 1025   | correo saliente de desarrollo                                |
| Mailpit web          | 8025   | bandeja donde se leen esos correos (<http://localhost:8025>) |

Comandos útiles: `make logs` para seguir los logs, `make down` para parar la pila, `make seed` para
cargar datos de ejemplo, `make test` y `make test-frontend` para las pruebas, `make
test-integration` para las que usan Testcontainers (necesita Docker), `make lint` para ESLint y
Prettier, y `make help` para ver todos los atajos. Para trabajar sin contenedores, `npm run
start:dev -w backend` y `npm run dev -w frontend` (este último necesita `--port 3001` si la API ya
ocupa el 3000).

## Datos de ejemplo

`npm run seed` (o `make seed` con la pila levantada) rellena la base de datos con un hogar de
prueba: dos usuarios que comparten casa, 25 recetas con ingredientes y pasos, el plan de la semana
en curso y una despensa básica.

| Usuario            | Contraseña    | Rol en el hogar |
| ------------------ | ------------- | --------------- |
| `ana@example.com`  | `Recetas123!` | propietaria     |
| `luis@example.com` | `Recetas123!` | miembro         |

El script se conecta con la `MONGO_URL` del entorno. Para ejecutarlo desde el host hace falta un
`.env` con una URL accesible (por ejemplo, `MONGO_URL=mongodb://localhost:27017/recipes?replicaSet=rs0`
con Mongo publicado en el 27017); dentro de Docker la variable ya apunta al servicio `mongo`.

Es idempotente: los usuarios se buscan por correo, el hogar por nombre y las recetas por título, así
que se puede ejecutar varias veces sin duplicar datos. El plan de la semana y la despensa se
actualizan con los valores del seed.
