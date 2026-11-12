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
