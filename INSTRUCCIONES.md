# INSTRUCCIONES — "Recipe Planner" con NestJS + MongoDB + Next.js

Guía de prompts para construir desde cero **Recipe Planner**: una app para un hogar
compartido. Sus miembros guardan recetas (con foto, ingredientes y pasos), las importan desde
una URL, planifican las comidas de la semana y generan una lista de la compra que agrega los
ingredientes, descuenta la despensa y se marca en tiempo real desde varios móviles a la vez.

| Pieza | Tecnología | Qué se practica |
|---|---|---|
| Runtime | Node.js 22 + TypeScript | |
| Framework | NestJS 10 (adaptador **Fastify**) | Módulos, providers, guards, pipes, interceptors |
| Base de datos | **MongoDB 7** (replica set de un nodo) + Mongoose | Documentos, índices, transacciones multi-documento |
| Caché / colas | Redis 7 + **BullMQ** (`@nestjs/bullmq`) | Trabajos en segundo plano con reintentos |
| Archivos | **MinIO** (compatible con S3) + URLs prefirmadas | Subidas directas desde el navegador |
| Validación | `class-validator` + `class-transformer` (`ValidationPipe` global) | |
| Auth | Email + contraseña (`argon2`) + **JWT de acceso corto + refresh token rotatorio** con detección de reutilización, ambos en cookies `httpOnly` | Lo que el proyecto anterior omitió a propósito |
| Tiempo real | Socket.IO (`@nestjs/websockets`) con adaptador de Redis | Salas por hogar |
| Docs API | `@nestjs/swagger` | |
| Rate limiting | `@nestjs/throttler` con almacenamiento en Redis | |
| Logging | `nestjs-pino` | |
| Tests backend | Jest + Supertest + Testcontainers (Mongo y Redis) | |
| Frontend | **Next.js 15** (App Router, React Server Components, Server Actions) + Tailwind 4 | SSR y streaming |
| Estado cliente | TanStack Query solo en las partes interactivas | |
| Tests frontend | Vitest + React Testing Library | |
| E2E | Playwright | |
| Contenedores | Docker Compose (dev, test, e2e, prod con `output: 'standalone'`) | |

## Cómo usar este documento

0. La **Fase Previa** se ejecuta a mano (`P1..P8`).
1. Cada **fase** empieza con una rama y termina con una PR aprobada y fusionada en `main`.
2. Cada punto intermedio es un prompt autónomo que termina con commit + push.
3. No saltes fases. Si un prompt falla, corrígelo en un commit adicional en la misma rama.
4. GitHub no deja aprobar una PR propia: "apruébala" significa CI en verde.

## Criterios de aceptación globales

- `docker compose up --build` levanta Mongo, Redis, MinIO, Mailpit, API, worker y frontend.
- El access token dura 15 minutos y el refresh token se rota en cada uso; reutilizar un refresh
  token ya usado revoca toda la familia de sesiones.
- Ningún token vive en `localStorage`; las cookies son `httpOnly`.
- Las imágenes se suben directamente a MinIO con una URL prefirmada; la API nunca recibe el
  binario.
- La importación por URL no puede usarse para alcanzar la red interna (protección SSRF).
- Un miembro solo ve las recetas, planes y listas de sus hogares.
- Existen cuatro capas de prueba: unitaria e integración backend, unitaria frontend y E2E.

---

## Fase Previa — Crear el repositorio desde cero

### Nombre sugerido del proyecto

| Uso | Valor |
|---|---|
| Carpeta y repositorio | `recipe-planner-nest` |
| API | `backend/` (NestJS) |
| Frontend | `frontend/` (Next.js) |

Alternativas: `meal-planner-nest`, `despensa-nest`.

### Requisitos previos

P1- Verifica las herramientas:

```bash
node --version         # 22.x
npx @nestjs/cli --version
docker --version && docker compose version
gh --version
```

P2- Autentícate con `gh auth login`.

### Crear la carpeta y el repositorio

P3- Crea la carpeta, git y el remoto privado:

```bash
mkdir -p ~/Developer && cd ~/Developer
mkdir recipe-planner-nest && cd recipe-planner-nest
git init -b main
git commit --allow-empty -m "chore: initial commit"
gh repo create recipe-planner-nest --private --source=. --remote=origin
git push -u origin main
```

### Andamiaje inicial

P4- Genera la API:

```bash
npx @nestjs/cli new backend --package-manager npm --strict --skip-git
cd backend && npm i @nestjs/platform-fastify && cd ..
```

P5- Genera el frontend:

```bash
npx create-next-app@15 frontend --ts --tailwind --eslint --app --src-dir --no-turbopack --import-alias "@/*"
```

P6- Crea el resto de carpetas:

```bash
mkdir -p e2e docs secrets infra
```

P7- Comprueba que ambos arrancan (`npm run start:dev` en `backend/`, `npm run dev` en `frontend/`).

P8- Sube el andamiaje:

```bash
git add . && git commit -m "chore: scaffold NestJS API, Next.js app and monorepo folders" && git push
```

A partir de aquí, abre Claude Code en `~/Developer/recipe-planner-nest` y continúa con el
prompt **1**.

---

## Fase 0 — Repositorio y convenciones

1- Crea una rama llamada `chore/bootstrap-repo` para las siguientes acciones.

2- Crea el `README.md` con el título, una descripción de dos párrafos (recetas de un hogar compartido, importación desde URL, plan semanal y lista de la compra en tiempo real) y la tabla del stack. Haz commit y push.

3- Agrega un `.gitignore` para Node (`node_modules/`, `dist/`, `.next/`, `coverage/`, `*.tsbuildinfo`), Playwright, macOS y entorno. Haz commit y push.

4- Agrega `LICENSE` MIT y `secrets/README.md`. Haz commit y push.

5- Convierte el repositorio en un **workspace de npm** (`package.json` raíz con `workspaces: ["backend", "frontend", "e2e", "packages/*"]`) y crea `packages/contracts` con los tipos y constantes compartidos (nombres de eventos de Socket.IO, códigos de error, unidades de medida). Documenta en `docs/architecture.md` qué va en `contracts` y qué no (nunca lógica de servidor). Haz commit y push.

6- Sustituye el adaptador Express de Nest por **Fastify** en `main.ts` (`NestFactory.create<NestFastifyApplication>`) y documenta el motivo. Haz commit y push.

7- Organiza el backend en módulos de Nest: `auth`, `users`, `households`, `recipes`, `media`, `imports`, `meal-plans`, `shopping`, `pantry`, `realtime` y `common` (filtros, interceptores, pipes, decoradores). Documenta la regla: los controladores solo validan y delegan, los servicios no conocen HTTP y los repositorios son los únicos que tocan Mongoose. Haz commit y push.

8- Configura ESLint (flat config con `typescript-eslint` estricto) y Prettier compartidos en la raíz, con scripts `lint`, `format`, `format:check` y `typecheck` en cada workspace. Haz commit y push.

9- Crea una PR desde `chore/bootstrap-repo`, apruébala y haz merge en la rama `main`.

---

## Fase 1 — Docker y ambiente de desarrollo

10- Crea una rama llamada `chore/docker-dev-environment` para las siguientes acciones.

11- Crea `backend/Dockerfile` de desarrollo (`node:22-alpine`, `npm ci` del workspace, `nest start --watch` en el puerto 3000) y `frontend/Dockerfile` (`next dev` en el 3001). Haz commit y push.

12- Crea `docker-compose.yml` con `mongo` (`mongo:7`, **replica set de un nodo** `rs0` inicializado por un healthcheck con `rs.initiate()` idempotente, porque las transacciones lo exigen), `redis`, `minio` (puertos 9000 API y 9001 consola) más un servicio `minio-init` con `mc` que crea el bucket `recipes` y su política CORS, `mailpit`, `backend`, `worker` (misma imagen, `node dist/worker.js`) y `frontend`. Usa `environment` explícito con `${VAR:?mensaje}` para los secretos. Haz commit y push.

13- Monta el código para la recarga y excluye `node_modules/`, `dist/` y `.next/` con volúmenes anónimos. Haz commit y push.

14- Crea los `.dockerignore`. Haz commit y push.

15- Crea `.env.example` con `MONGO_URL`, `REDIS_URL`, `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `MAIL_FROM`, `APP_ENV`, `LOG_LEVEL`, `FRONTEND_URL` y `API_INTERNAL_URL`. Explica la diferencia entre `S3_ENDPOINT` (red interna) y `S3_PUBLIC_ENDPOINT` (el que firma las URLs para el navegador). Haz commit y push.

16- Crea `docker-compose.test.yml` con `mongo-test` (replica set, puerto 27018, `tmpfs`) y `redis-test` (puerto 6380). Haz commit y push.

17- Crea el `Makefile` con `up`, `down`, `logs`, `seed`, `test`, `test-frontend`, `test-e2e`, `lint`, `format` y `help`. Haz commit y push.

18- Documenta el arranque y los puertos (3001 frontend, 3000 API, 27017, 6379, 9001 consola de MinIO, 8025 Mailpit) en el `README.md`. Haz commit y push.

19- Crea una PR desde `chore/docker-dev-environment`, apruébala y haz merge en la rama `main`.

---

## Fase 2 — Fundamentos de la API

20- Crea una rama llamada `feat/api-foundations` para las siguientes acciones.

21- Configura `@nestjs/config` con un esquema de validación (`class-validator` sobre una clase `EnvironmentVariables` o `zod`) que haga fallar el arranque si falta una variable o si los secretos JWT tienen menos de 32 caracteres. Soporta `*_FILE` para los secretos; el valor plano gana. Crea providers tipados por sección (`authConfig`, `storageConfig`…) con `registerAs`. Tests. Haz commit y push.

22- Configura `nestjs-pino`: `pino-pretty` en desarrollo y JSON en el resto, `genReqId` que reutiliza o genera `X-Request-Id` (y lo devuelve), y `redact` para `req.headers.cookie`, `req.headers.authorization` y `res.headers["set-cookie"]`. Añade un test que verifique la redacción. Haz commit y push.

23- Crea un `AppException` con `status`, `code`, `message` y `details`, y un `AllExceptionsFilter` global que devuelva siempre `{ "error": { "code", "message", "details": [] } }`: los errores del `ValidationPipe` como 400 `VALIDATION_ERROR` con un detalle por propiedad, las `HttpException` de Nest con su código, los errores de clave duplicada de Mongo (`11000`) como 409 `CONFLICT` y cualquier otro como 500 sin stack. Haz commit y push.

24- Registra el `ValidationPipe` global con `whitelist`, `forbidNonWhitelisted`, `transform` y `stopAtFirstError: false`, y un `ParseObjectIdPipe` para los parámetros de ruta. Haz commit y push.

25- Implementa `GET /api/health` con `@nestjs/terminus` (Mongo con `ping`, Redis y MinIO), con timeout de 2 s, devolviendo 200 o 503. Haz commit y push.

26- Configura CORS solo para `FRONTEND_URL` con credenciales, `@fastify/helmet` con CSP estricta para la API y `@fastify/cookie`. Haz commit y push.

27- Activa `enableShutdownHooks()` y el apagado ordenado (cierra Mongo, Redis, colas y sockets). Haz commit y push.

28- Crea una PR desde `feat/api-foundations`, apruébala y haz merge en la rama `main`.

---

## Fase 3 — Modelo de datos en MongoDB

29- Crea una rama llamada `feat/data-model` para las siguientes acciones.

30- Documenta en `docs/architecture.md` el modelado: qué se **embebe** (ingredientes y pasos dentro de la receta, slots dentro del plan semanal, ítems dentro de la lista) y qué se **referencia** (usuarios, hogares, recetas desde el plan), con la regla "se embebe lo que se lee y escribe siempre junto y está acotado en tamaño". Haz commit y push.

31- Crea los esquemas `User` (`email` único en minúsculas, `passwordHash`, `displayName`) y `Household` (`name`, `members: [{ userId, role: 'owner'|'member', joinedAt }]`, `inviteCodeHash`), con índices `{ email: 1 }` único y `{ 'members.userId': 1 }`. Haz commit y push.

32- Crea `Recipe` (`householdId`, `title`, `description`, `servings`, `prepMinutes`, `cookMinutes`, `tags[]`, `ingredients: [{ name, quantity, unit, note }]`, `steps: [{ text }]`, `image: { key, width, height }`, `source: { url, importedAt }`, `createdBy`, timestamps) con un índice de texto sobre `title`, `tags` e `ingredients.name` con pesos, y un índice `{ householdId: 1, updatedAt: -1 }`. Haz commit y push.

33- Crea en `packages/contracts` el catálogo de unidades (`g`, `kg`, `ml`, `l`, `tsp`, `tbsp`, `cup`, `unit`, `pinch`) con su dimensión (masa, volumen, cantidad) y su factor a la unidad base, y en el backend `common/units.ts` con `normalize(quantity, unit)` y `add(a, b)` que solo suma unidades de la misma dimensión. Tests de tabla. Haz commit y push.

34- Crea `MealPlan` (`householdId`, `weekStart` como fecha ISO del lunes, `slots: [{ day: 0–6, meal: 'breakfast'|'lunch'|'dinner', recipeId, servings }]`) con índice único `{ householdId: 1, weekStart: 1 }`, y `PantryItem` (`householdId`, `name` normalizado, `quantity`, `unit`). Haz commit y push.

35- Crea `ShoppingList` (`householdId`, `weekStart`, `items: [{ _id, name, quantity, unit, checked, checkedBy, source: 'plan'|'manual' }]`, `version`) con `optimisticConcurrency: true`. Haz commit y push.

36- Crea un repositorio por agregado que encapsule Mongoose (`RecipesRepository`, …) y que **siempre** filtre por `householdId`, con `lean()` en las lecturas. Haz commit y push.

37- Crea un script `npm run seed` que genere dos usuarios, un hogar compartido, 25 recetas con ingredientes realistas, un plan de esta semana y la despensa. Haz commit y push.

38- Crea una PR desde `feat/data-model`, apruébala y haz merge en la rama `main`.

---

## Fase 4 — Autenticación con refresh tokens rotatorios

39- Crea una rama llamada `feat/auth-refresh-rotation` para las siguientes acciones.

40- Documenta primero en `docs/architecture.md` el diseño: access token JWT de 15 minutos en la cookie `access_token` (`Path=/api`); refresh token opaco de 30 días en la cookie `refresh_token` (`Path=/api/auth/refresh`); en la base se guarda su hash dentro de una **familia** (`RefreshSession { familyId, userId, tokenHash, expiresAt, usedAt, revokedAt }`); cada refresh emite uno nuevo y marca el anterior como usado; si llega uno ya usado, se revoca toda la familia (posible robo). Haz commit y push.

41- Implementa `POST /api/auth/register` y `POST /api/auth/login` con `argon2id`, mensaje y tiempo idénticos para email inexistente y contraseña incorrecta, y la emisión de las dos cookies (`HttpOnly`, `SameSite=Lax`, `Secure` en producción). Haz commit y push.

42- Implementa `POST /api/auth/refresh` con la rotación descrita dentro de una transacción de Mongo, de modo que dos refresh simultáneos con el mismo token no puedan emitir dos tokens válidos. Haz commit y push.

43- Implementa `POST /api/auth/logout` (revoca la familia actual) y `POST /api/auth/logout-all` (todas las del usuario), y un índice TTL de Mongo sobre `expiresAt` para limpiar las sesiones caducadas. Haz commit y push.

44- Crea el `JwtAuthGuard` global (con un decorador `@Public()` para las excepciones) que lee la cookie `access_token` y responde 401 `TOKEN_EXPIRED` si caducó (para que el cliente sepa refrescar) o `UNAUTHORIZED` en otro caso, y el decorador `@CurrentUser()`. Implementa `GET /api/auth/me`. Haz commit y push.

45- Añade la protección CSRF para las mutaciones con una comprobación de `Origin` y, como segunda capa, el patrón *double submit* (cookie `csrf` legible + cabecera `X-CSRF-Token`). Documenta por qué aquí se añade la segunda capa: el refresh token tiene una vida larga. Haz commit y push.

46- Escribe tests unitarios del servicio de rotación (con repositorio en memoria y reloj inyectable) y tests de integración: login, refresh, refresh reutilizado que revoca la familia, refresh concurrente, logout y acceso con access token caducado. Haz commit y push.

47- Crea una PR desde `feat/auth-refresh-rotation`, apruébala y haz merge en la rama `main`.

---

## Fase 5 — Hogares y autorización

48- Crea una rama llamada `feat/households` para las siguientes acciones.

49- Implementa `POST /api/households`, `GET /api/households` (los míos) y `GET /api/households/:id`. Al registrarse, cada usuario recibe un hogar propio. Haz commit y push.

50- Implementa las invitaciones con un código de 8 caracteres (alfabeto sin caracteres ambiguos) válido 48 horas, del que solo se guarda el hash: `POST /api/households/:id/invite` (solo el owner) y `POST /api/households/join` con el código. Haz commit y push.

51- Crea el `HouseholdMemberGuard` que lee `:householdId` de la ruta, comprueba la membresía y deja el rol en la petición, y un decorador `@HouseholdRole('owner')`. Un no miembro recibe 404. Haz commit y push.

52- Escribe tests de integración de aislamiento: un usuario de otro hogar recibe 404 en cada ruta anidada bajo `/api/households/:householdId/...`. Haz commit y push.

53- Crea una PR desde `feat/households`, apruébala y haz merge en la rama `main`.

---

## Fase 6 — Recetas e imágenes

54- Crea una rama llamada `feat/recipes-media` para las siguientes acciones.

55- Crea los DTOs de receta con `class-validator` (anidados con `@ValidateNested` y `@Type`), límites de tamaño (máximo 100 ingredientes y 50 pasos) y la unidad validada contra el catálogo de `contracts`. Haz commit y push.

56- Implementa el CRUD de recetas bajo `/api/households/:householdId/recipes` con búsqueda (`?q=` sobre el índice de texto, ordenado por `textScore`), filtro por `tags` y paginación por cursor (`updatedAt`, `_id`). Haz commit y push.

57- Implementa `POST /api/households/:householdId/media/upload-url`: valida el tipo (`image/jpeg`, `image/png`, `image/webp`) y el tamaño declarado (máx. 5 MiB), y devuelve una **URL prefirmada de `POST`** de S3 (`@aws-sdk/s3-presigned-post`) con `content-length-range` y una clave aleatoria bajo el prefijo del hogar. Haz commit y push.

58- Implementa la confirmación (`PUT /recipes/:id/image` con la clave): comprueba con `HeadObject` que el objeto existe, pertenece al prefijo del hogar y no supera el tamaño, y encola en BullMQ el trabajo `media.thumbnail` que genera con `sharp` las variantes de 320 y 960 px en WebP. Haz commit y push.

59- Sirve las imágenes mediante URLs prefirmadas de `GET` de corta duración generadas al leer la receta, y borra los objetos al eliminar la receta o cambiar la imagen (trabajo en la cola). Haz commit y push.

60- Escribe tests de integración con MinIO en Testcontainers: subida prefirmada real, rechazo por tamaño y tipo, clave de otro hogar rechazada y miniaturas generadas. Haz commit y push.

61- Crea una PR desde `feat/recipes-media`, apruébala y haz merge en la rama `main`.

---

## Fase 7 — Importación de recetas desde una URL

62- Crea una rama llamada `feat/recipe-import` para las siguientes acciones.

63- Implementa `POST /api/households/:householdId/imports` con `{ url }`: crea un `ImportJob` y lo encola en BullMQ (`imports`), con reintentos exponenciales (3) y `jobId` determinista por `(householdId, url)` durante 10 minutos para no duplicar. Responde 202. Haz commit y push.

64- Crea un `SafeHttpClient` para el worker que **impida SSRF**: solo `http`/`https` en los puertos 80 y 443, resolución DNS propia y rechazo de IPs privadas, loopback, link-local y de metadatos (`169.254.169.254`) en cada salto de redirección (máximo 3), timeout de 5 s, tamaño máximo de 2 MiB y solo `text/html`. Tests unitarios con un resolvedor DNS falso, incluido el caso de *DNS rebinding*. Haz commit y push.

65- Extrae la receta del JSON-LD `schema.org/Recipe` (o del microdato como alternativa), parsea los ingredientes en `{ quantity, unit, name }` con un parser propio que entienda fracciones (`1 1/2`, `½`) y unidades del catálogo, y deja el texto original en `note` si no se reconoce. Tests con fixtures HTML reales en `test/fixtures/`. Haz commit y push.

66- Al terminar, crea la receta como borrador, descarga la imagen con el mismo `SafeHttpClient` y súbela a MinIO, y notifica el resultado por Socket.IO. Haz commit y push.

67- Escribe tests del worker con Redis en Testcontainers: importación correcta, URL interna rechazada, página sin receta y reintento ante un 503. Haz commit y push.

68- Crea una PR desde `feat/recipe-import`, apruébala y haz merge en la rama `main`.

---

## Fase 8 — Plan semanal, despensa y lista de la compra

69- Crea una rama llamada `feat/meal-plan-shopping` para las siguientes acciones.

70- Implementa `GET /api/households/:householdId/meal-plans/:weekStart` (crea el plan vacío si no existe con un `upsert`) y `PUT …/slots` para asignar o quitar una receta de un slot con sus raciones. `weekStart` debe ser un lunes válido. Haz commit y push.

71- Implementa el CRUD de la despensa. Haz commit y push.

72- Crea `ShoppingListGenerator` como servicio puro: recibe el plan con sus recetas y la despensa, escala cada ingrediente por `servings / recipe.servings`, agrupa por nombre normalizado y dimensión, suma con `units.add`, resta la despensa y devuelve ítems con la unidad más legible (1500 g → 1.5 kg). Tests de tabla extensos. Haz commit y push.

73- Implementa `POST …/shopping-lists/:weekStart/generate`: regenera los ítems `source: 'plan'` conservando los `manual` y el estado `checked` de los que siguen existiendo. Haz commit y push.

74- Implementa `PATCH …/shopping-lists/:weekStart/items/:itemId` (marcar, cambiar cantidad) y `POST …/items` (añadir manual) con actualizaciones atómicas por elemento del array (`$set` con `arrayFilters`) en lugar de reescribir el documento, para que dos personas marcando a la vez no se pisen. Documenta por qué. Haz commit y push.

75- Escribe tests de integración: generación con escalado y despensa, regeneración que conserva lo manual y lo marcado, y 20 marcados concurrentes de ítems distintos sin pérdidas. Haz commit y push.

76- Crea una PR desde `feat/meal-plan-shopping`, apruébala y haz merge en la rama `main`.

---

## Fase 9 — Tiempo real con Socket.IO

77- Crea una rama llamada `feat/realtime-socketio` para las siguientes acciones.

78- Crea `RealtimeGateway` en el namespace `/realtime`: autentica en el handshake con la **cookie `access_token`** (mismo `JwtService`), comprueba `Origin` y rechaza con un error `UNAUTHORIZED`. Configura el adaptador `@socket.io/redis-adapter` para que funcione con varias réplicas y con el worker. Haz commit y push.

79- Al conectar, une el socket a las salas `household:{id}` de todos sus hogares; al unirse o salir de un hogar, actualiza las salas de los sockets abiertos de ese usuario. Haz commit y push.

80- Emite `shopping.item.updated`, `shopping.list.regenerated`, `meal-plan.updated`, `import.finished` y `import.failed` desde los servicios a través de un `RealtimePublisher` (interfaz) con los nombres de evento de `packages/contracts`. El worker publica usando el emisor de Redis (`@socket.io/redis-emitter`). Un fallo al emitir no afecta a la escritura. Haz commit y push.

81- Gestiona la caducidad del access token en sockets de larga duración: el servidor desconecta con `TOKEN_EXPIRED` al caducar y el cliente refresca y reconecta. Haz commit y push.

82- Escribe tests de integración con `socket.io-client`: un miembro recibe el ítem marcado por otro, un usuario de otro hogar no, el evento del worker llega a través de Redis y la desconexión al caducar el token. Haz commit y push.

83- Crea una PR desde `feat/realtime-socketio`, apruébala y haz merge en la rama `main`.

---

## Fase 10 — Endurecimiento, documentación e infraestructura de pruebas

84- Crea una rama llamada `feat/api-hardening-and-tests` para las siguientes acciones.

85- Configura `@nestjs/swagger` con el plugin del CLI, el esquema de seguridad de cookie, `ErrorResponse` común en todas las operaciones y la UI en `/api/docs` solo fuera de producción (CSP relajada solo ahí). Exporta el documento a `packages/contracts/openapi.json` con un script y añade un test que falle si difiere. Haz commit y push.

86- Configura `@nestjs/throttler` con almacenamiento en Redis: 5 logins por minuto por IP y por email, 30 refresh por hora por familia, 10 importaciones por hora por hogar y 120 escrituras por minuto por usuario, con 429 en el sobre común y `Retry-After`. Haz commit y push.

87- Limita el cuerpo de Fastify (`bodyLimit`, 1 MiB) y añade los tests del rate limiting. Haz commit y push.

88- Configura los tests de integración: Mongo (replica set) y Redis de Testcontainers por ejecución de Jest (`globalSetup`) o los de `docker-compose.test.yml` si existe la variable; una base por *worker* de Jest; helpers `createAuthenticatedAgent(email)` con Supertest y fábricas de recetas y planes. Haz commit y push.

89- Configura la cobertura con umbrales (80 % líneas y ramas) y separa `test` (unitarios) de `test:integration`. Haz commit y push.

90- Añade al `README.md` la tabla de las cuatro capas de prueba. Haz commit y push.

91- Crea una PR desde `feat/api-hardening-and-tests`, apruébala y haz merge en la rama `main`.

---

## Fase 11 — Frontend Next.js: base

92- Crea una rama llamada `feat/frontend-scaffold` para las siguientes acciones.

93- Define la paleta con `@theme` de Tailwind 4: `flour` (fondos), `pepper` (texto), `basil` (acento), `tomato` (alertas), `saffron` (destacados), y las fuentes con `next/font` (una serif para títulos de receta y una sans para la interfaz). Haz commit y push.

94- Documenta en `docs/architecture.md` el reparto de responsabilidades: los Server Components cargan los datos llamando a la API por `API_INTERNAL_URL` y reenviando las cookies de la petición; las mutaciones simples son Server Actions; las partes interactivas en vivo (lista de la compra) son Client Components con TanStack Query y Socket.IO. Haz commit y push.

95- Crea `src/server/api.ts` (`import 'server-only'`) con un `apiFetch` tipado desde `openapi.json` (`openapi-fetch`) que lee las cookies con `cookies()` de `next/headers`, reenvía solo `access_token`, `refresh_token` y `csrf`, desactiva la caché de `fetch` para datos de usuario (`cache: 'no-store'`) y propaga `X-Request-Id`. Tests. Haz commit y push.

96- Implementa el refresco transparente en el servidor: si la API responde 401 `TOKEN_EXPIRED`, `middleware.ts` llama a `/api/auth/refresh`, copia las nuevas cookies a la respuesta y repite. Documenta por qué se hace en el middleware (los Server Components no pueden escribir cookies). Haz commit y push.

97- Crea `src/lib/api-client.ts` para el navegador (mismo origen gracias a un *rewrite* de `/api` en `next.config.ts`), con el token CSRF y el reintento tras refresh, y configura el `QueryClientProvider` solo en el layout de las rutas interactivas. Haz commit y push.

98- Crea la estructura de rutas: `(auth)/login`, `(auth)/register`, `(app)/layout.tsx` (comprueba la sesión en el servidor y redirige), `(app)/[householdId]/recipes`, `…/recipes/[id]`, `…/recipes/new`, `…/plan/[weekStart]`, `…/shopping/[weekStart]`, `…/pantry` y `(app)/settings`, con `loading.tsx` y `error.tsx` en cada segmento. Haz commit y push.

99- Crea una PR desde `feat/frontend-scaffold`, apruébala y haz merge en la rama `main`.

---

## Fase 12 — Frontend: autenticación y hogares

100- Crea una rama llamada `feat/frontend-auth` para las siguientes acciones.

101- Implementa login y registro como formularios con **Server Actions** (`useActionState`) que llaman a la API y reenvían las cookies con `cookies().set`, con errores de campo accesibles y sin perder el email al fallar. Funcionan sin JavaScript. Haz commit y push.

102- Implementa el selector de hogar en la cabecera, la creación de hogares, la invitación (mostrar y copiar el código) y unirse con un código. Haz commit y push.

103- Implementa el cierre de sesión (una y todas) como Server Action. Haz commit y push.

104- Escribe tests de componente de los formularios y tests de las Server Actions con la API simulada. Haz commit y push.

105- Crea una PR desde `feat/frontend-auth`, apruébala y haz merge en la rama `main`.

---

## Fase 13 — Frontend: recetas

106- Crea una rama llamada `feat/frontend-recipes` para las siguientes acciones.

107- Crea la lista de recetas como Server Component con búsqueda en la URL (`searchParams`), filtros por etiqueta, tarjetas con la miniatura (`next/image` con `remotePatterns` hacia MinIO) y "Cargar más" con el cursor. Haz commit y push.

108- Crea el detalle de la receta con el escalado de raciones en el cliente (un Client Component pequeño que recalcula cantidades con las funciones de `contracts`) y el modo cocina (pantalla siempre encendida con la Wake Lock API, si existe, y pasos grandes). Haz commit y push.

109- Crea el editor de recetas (Client Component con React Hook Form) con listas dinámicas de ingredientes y pasos reordenables por teclado, selector de unidad del catálogo y subida de foto directa a MinIO con la URL prefirmada y barra de progreso. Haz commit y push.

110- Crea el diálogo "Importar desde URL" que lanza la importación y escucha `import.finished`/`import.failed` por Socket.IO para llevar al borrador o mostrar el error. Haz commit y push.

111- Escribe tests de componente: escalado de raciones, editor con validación, subida con progreso simulado e importación con eventos simulados. Haz commit y push.

112- Crea una PR desde `feat/frontend-recipes`, apruébala y haz merge en la rama `main`.

---

## Fase 14 — Frontend: plan semanal y lista de la compra en vivo

113- Crea una rama llamada `feat/frontend-plan-shopping` para las siguientes acciones.

114- Crea el plan semanal: cuadrícula días × comidas con navegación entre semanas, un selector de receta con búsqueda para cada slot y las raciones. En móvil, una lista por día. Haz commit y push.

115- Crea `src/realtime/socket.ts` con una única conexión de `socket.io-client` al namespace `/realtime` (`withCredentials`), conteo de referencias, y refresco del token y reconexión ante `TOKEN_EXPIRED`. Haz commit y push.

116- Crea la lista de la compra como Client Component: agrupada por pasillo (categoría simple derivada del nombre), con marcado optimista (`useMutation` con `onMutate` y rollback) y botón grande de 48 px por ítem. Haz commit y push.

117- Conecta `shopping.item.updated` y `shopping.list.regenerated` a la caché de TanStack Query (`setQueryData`) y muestra quién marcó cada ítem. Al reconectar, invalida la lista. Haz commit y push.

118- Crea la página de la despensa con alta rápida y edición en línea. Haz commit y push.

119- Escribe tests: cuadrícula del plan, marcado optimista con rollback y aplicación de eventos con un socket falso. Haz commit y push.

120- Crea una PR desde `feat/frontend-plan-shopping`, apruébala y haz merge en la rama `main`.

---

## Fase 15 — Pruebas end-to-end con Playwright

121- Crea una rama llamada `test/e2e-playwright` para las siguientes acciones.

122- Inicializa el workspace `e2e/` con Playwright (Chromium, reintentos en CI, reporte HTML), `docker-compose.e2e.yml` con `APP_ENV=test` y un endpoint de reinicio de datos solo en ese entorno. Haz commit y push.

123- Escribe `smoke.spec.ts` (`@smoke`): login visible, `/api/health` ok y la consola de MinIO no expuesta en la pila E2E. Haz commit y push.

124- Escribe `critical-flow.spec.ts`: registrarse, crear una receta con foto (fixture JPEG), añadirla al plan de dos días, generar la lista y comprobar las cantidades agregadas. Haz commit y push.

125- Escribe `shopping-realtime.spec.ts` con dos contextos (dos miembros del mismo hogar): el que invita y el que se une; uno marca un ítem y el otro lo ve marcado sin recargar. Haz commit y push.

126- Escribe `session.spec.ts`: con `page.clock`, avanza 16 minutos y comprueba que la navegación sigue funcionando gracias al refresh transparente; después reutiliza a mano un refresh token viejo y comprueba que se cierra la sesión. Haz commit y push.

127- Escribe `import.spec.ts` con un servidor estático de fixtures dentro de la red de E2E (añadido a la lista blanca solo en `test`) que sirve una página con JSON-LD. Haz commit y push.

128- Añade los scripts `test` y `test:smoke` y documenta la pila E2E. Haz commit y push.

129- Crea una PR desde `test/e2e-playwright`, apruébala y haz merge en la rama `main`.

---

## Fase 16 — Integración continua

130- Crea una rama llamada `ci/github-actions` para las siguientes acciones.

131- Crea `.github/workflows/ci.yml` con `permissions: contents: read`, `concurrency` y `timeout-minutes`, y `npm ci` del workspace con la caché de `setup-node`. Haz commit y push.

132- Job `lint`: `lint`, `format:check` y `typecheck` en todos los workspaces. Haz commit y push.

133- Job `backend-test`: unitarios y de integración (Testcontainers con el Docker del runner) con cobertura y la comprobación del `openapi.json` exportado. Haz commit y push.

134- Job `frontend-test`: tests con cobertura, `next build` y deriva de tipos. Haz commit y push.

135- Job `audit`: `npm audit --audit-level=high` del workspace. Haz commit y push.

136- Job `e2e` con la pila E2E (`--wait`), artefactos solo si falla y `down -v` siempre. Haz commit y push.

137- Configura la protección de `main` y documéntala. Haz commit y push.

138- Crea una PR desde `ci/github-actions`, apruébala y haz merge en la rama `main`.

---

## Fase 17 — Producción

139- Crea una rama llamada `feat/production-stack` para las siguientes acciones.

140- Crea `backend/Dockerfile.prod` multi-stage para la API y el worker: build del workspace, `npm prune --omit=dev` y runtime `node:22-alpine` como `node` (no root), con `tini` como PID 1 y `NODE_ENV=production`. Haz commit y push.

141- Configura Next.js con `output: 'standalone'` y crea `frontend/Dockerfile.prod` que copie solo `.next/standalone`, `.next/static` y `public`, como usuario no root en el 3001. Haz commit y push.

142- Crea `docker-compose.prod.yml` con `name: recipes-prod`, un `caddy` delante (TLS interno, `/api` y `/socket.io` a la API, `/media` a MinIO para que las URLs prefirmadas tengan el host público, y el resto a Next), Mongo con autenticación y replica set, Redis con contraseña y MinIO sin consola pública. Haz commit y push.

143- Usa Docker secrets para las contraseñas de Mongo, Redis y MinIO y los secretos JWT con `*_FILE`; crea `.env.production.example` sin secretos. Haz commit y push.

144- Configura `trustProxy` de Fastify solo para la red de Caddy y verifica con un test que el rate limiting usa la IP real. Haz commit y push.

145- Configura el apagado ordenado (el worker termina el trabajo en curso con `worker.close()`) y `stop_grace_period: 30s`, y límites de memoria con `--max-old-space-size` acorde. Haz commit y push.

146- Añade al CI el job `build-prod-images` que construye las imágenes y verifica el usuario no root y el healthcheck. Haz commit y push.

147- Verifica la pila de producción en local y documenta el procedimiento. Haz commit y push.

148- Crea una PR desde `feat/production-stack`, apruébala y haz merge en la rama `main`.

---

## Fase 18 — Accesibilidad, rendimiento y documentación final

149- Crea una rama llamada `docs/final-polish` para las siguientes acciones.

150- Audita con `@axe-core/playwright` (recetas, editor, plan y lista) y corrige. Haz commit y push.

151- Revisa la app a 360 px, con la lista de la compra pensada para una mano y el modo cocina legible a un metro. Haz commit y push.

152- Mide con `@next/bundle-analyzer` y Lighthouse: el detalle de la receta debe ser Server Component casi entero y el cliente de Socket.IO solo debe cargarse en la lista y en la importación. Haz commit y push.

153- Completa `docs/architecture.md`: embeber frente a referenciar, rotación de refresh tokens, URLs prefirmadas, SSRF, actualizaciones atómicas de arrays, RSC frente a cliente y límites conocidos. Haz commit y push.

154- Completa el `README.md` con la tabla de variables de entorno, los comandos útiles y capturas. Haz commit y push.

155- Revisión final: sin secretos, sin `TODO`, sin generados y CI en verde. Haz commit y push.

156- Crea una PR desde `docs/final-polish`, apruébala y haz merge en la rama `main`.

---

## Verificación final

- [ ] `docker compose up --build` deja la app en `http://localhost:3001`.
- [ ] Tras 15 minutos la sesión sigue viva por el refresh; reutilizar un refresh viejo cierra la sesión.
- [ ] Una foto se sube directamente a MinIO y la API nunca recibe el binario.
- [ ] Importar `http://169.254.169.254/` o `http://localhost:3000/` desde la app se rechaza.
- [ ] La lista de la compra agrega y escala bien las cantidades y descuenta la despensa.
- [ ] Dos miembros marcan ítems a la vez y ambos ven el estado correcto sin recargar.
- [ ] Un usuario de otro hogar recibe 404 en todas las rutas del hogar y no recibe sus eventos.
- [ ] La pila de producción arranca detrás de Caddy con secretos de archivo.
