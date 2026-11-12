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

Comandos útiles: `make logs` para seguir los logs, `make down` para parar, `make seed` para cargar
datos de ejemplo, `make test` y `make test-frontend` para las pruebas, `make lint` para ESLint y
Prettier, y `make help` para ver todos los atajos. Para trabajar sin contenedores, `npm run
start:dev -w backend` y `npm run dev -w frontend` (este último necesita `--port 3001` si la API ya
ocupa el 3000).
