# Arquitectura

## Qué va en `packages/contracts` y qué no

`@recipe-planner/contracts` es el contrato compartido entre la API NestJS, el worker y la web
Next.js. Contiene **solo datos**: tipos, uniones, constantes y funciones puras de comprobación de
tipos que se pueden ejecutar igual en Node y en el navegador, sin dependencias externas.

### Sí va

- **Eventos de Socket.IO**: el namespace (`/realtime`), los nombres de evento
  (`shopping.item.updated`, `shopping.list.regenerated`, `meal-plan.updated`,
  `import.finished`, `import.failed`) y la forma de su carga útil. Emisor y receptor comparten
  la misma definición, así que renombrar un evento o cambiar un campo rompe la compilación en
  ambos lados.
- **Códigos de error**: los valores de `error.code` del sobre común
  (`VALIDATION_ERROR`, `TOKEN_EXPIRED`, `NOT_FOUND`, …), el tipo `ErrorResponse` y la forma de
  `details`. El cliente decide a partir del código; el texto del mensaje no es contrato.
- **Catálogo de unidades**: la lista de unidades permitidas (`g`, `kg`, `ml`, `l`, `tsp`,
  `tbsp`, `cup`, `unit`, `pinch`), su dimensión (masa, volumen, cantidad) y su factor a la
  unidad base. Lo consumen los DTOs para validar, la web para el selector y el generador de la
  lista de la compra.
- **Comprobaciones de tipos** como `isUnit()` o `unitsOfDimension()`: recorren solo las
  constantes anteriores.
- Tipos de dominio estables que ambos lados necesitan tal cual: `WeekStart`, `MealSlot`,
  `MemberRef`.

### No va

- **Lógica de servidor**: reglas de negocio, `ShoppingListGenerator`, normalización y suma de
  cantidades (`units.add`, `units.normalize`), escalado de raciones, autorización o cualquier
  cosa que consulte base de datos, Redis, MinIO o el reloj. Esas funciones viven en
  `backend/src/common/` y en los servicios; el frontend las recibe ya calculadas por la API.
- **Esquemas de persistencia**: modelos y esquemas de Mongoose, índices, nombres de colección.
  La base de datos es un detalle del backend y cambiarla no debe obligar a tocar la web.
- **Detalles de transporte HTTP**: controladores, rutas de Nest, DTOs con decoradores de
  `class-validator`, códigos de estado, configuración de Fastify o de cookies.
- **Credenciales o configuración**: URLs, secretos, nombres de variables de entorno. La
  configuración se valida en el backend.
- **Dependencias**: nada de `@nestjs/*`, `mongoose`, `next`, `socket.io` ni paquetes de Node.
  Si un tipo necesita uno de ellos, no es un contrato compartido.

### Cómo se consume

El paquete es ESM y se compila a `dist/` con `tsc` (`npm run build -w @recipe-planner/contracts`).
Los consumidores lo importan por el nombre del paquete (`@recipe-planner/contracts`) y resuelven
`dist/index.js` y `dist/index.d.ts` mediante `exports`; nadie importa rutas internas del paquete.
El frontend lo transpila con `transpilePackages` en `next.config.ts` y el backend lo trata como
una dependencia más del workspace.

## Módulos del backend y capas

`backend/src` se divide por funcionalidad. Cada carpeta es un módulo de Nest registrado en
`AppModule` y dueño de sus controladores, servicios y repositorios:

| Módulo       | Responsabilidad                                                 |
| ------------ | --------------------------------------------------------------- |
| `auth`       | Registro, login, refresh rotatorio, logout y emisión de cookies |
| `users`      | Perfil del usuario autenticado                                  |
| `households` | Hogares, membresías, roles e invitaciones con código            |
| `recipes`    | CRUD, búsqueda y paginación de recetas                          |
| `media`      | URLs prefirmadas de MinIO, confirmación de subidas y miniaturas |
| `imports`    | Importación de recetas desde una URL y estado del trabajo       |
| `meal-plans` | Plan semanal y asignación de recetas a cada hueco               |
| `shopping`   | Lista de la compra: generación, marcado y edición de ítems      |
| `pantry`     | Despensa del hogar                                              |
| `realtime`   | Gateway Socket.IO y publicador de eventos                       |
| `common`     | Filtros, interceptores, pipes y decoradores transversales       |

### Regla de dependencias

La dirección es siempre **controlador → servicio → repositorio**. Nunca al revés y nunca
saltándose una capa.

**Los controladores solo validan y delegan.** Reciben la petición, dejan que el `ValidationPipe`
global valide el DTO, extraen lo que aporta el decorador (`@CurrentUser()`,
`@HouseholdRole('owner')`) y llaman a un único método del servicio. No contienen reglas de
negocio, no construyen consultas, no importan modelos de Mongoose y no conocen detalles de
persistencia. Devuelven el resultado del servicio tal cual o un DTO de respuesta.

**Los servicios no conocen HTTP.** Son lógica de dominio: calculan, agregan, deciden y coordinan
repositorios. No importan `Request`, `Response`, `@Res()`, cookies, códigos de estado ni nada de
la capa de transporte, y por eso se pueden probar sin levantar un servidor. Cuando algo falla
lanzan un error de dominio (`AppException` con su `code`), y es el `AllExceptionsFilter` global
quien lo traduce al sobre HTTP; ningún servicio escribe una respuesta.

**Los repositorios son los únicos que tocan Mongoose.** Solo ellos importan `@nestjs/mongoose`,
los modelos y los `FilterQuery`. Encapsulan las consultas, los índices, `lean()` en las
lecturas, `arrayFilters` en las actualizaciones atómicas y **siempre** filtran por
`householdId` para que el aislamiento entre hogares no dependa del llamador. No contienen reglas
de negocio: si hay que decidir algo, se decide en el servicio.

Otras consecuencias de la organización:

- Un módulo no usa el repositorio de otro módulo: si necesita datos ajenos, importa el módulo y
  llama a su servicio exportado.
- `common` es transversal y no depende de ningún módulo de funcionalidad: filtros, interceptores,
  pipes y decoradores compartidos, sin lógica de negocio ni acceso a datos.
- `realtime` expone la interfaz de publicación; los servicios emiten a través de ella y un fallo
  al emitir nunca hace fallar la escritura.
- Los nombres de carpetas son kebab-case (`meal-plans`) y las clases PascalCase con sufijo
  (`MealPlansModule`, `MealPlansService`, `MealPlansRepository`).

## Modelado de datos

MongoDB no impone un esquema, así que la decisión de diseño es dónde viven los datos: dentro del
documento padre o en su propia colección. La regla es una sola:

> **Se embebe lo que se lee y escribe siempre junto y está acotado en tamaño.**

### Qué se embebe

| Documento       | Qué lleva dentro                                                      | Por qué                                                                                                                                                                                                             |
| --------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recipes`       | `ingredients: [{ name, quantity, unit, note }]` y `steps: [{ text }]` | Se editan en la misma pantalla que la receta y se leen siempre con ella. Una receta tiene del orden de 10–20 ingredientes y 10–15 pasos: el array está acotado y cabe holgado en el límite de 16 MiB por documento. |
| `meal-plans`    | `slots: [{ day, meal, recipeId, servings }]`                          | El plan se lee y se guarda entero al abrir la semana; los slots son como máximo 7 días × 3 comidas = 21, un tamaño fijo por definición.                                                                             |
| `shopping-list` | `items: [{ _id, name, quantity, unit, checked, checkedBy, source }]`  | Marcar un ítem es actualizar un elemento del array (`arrayFilters`), sin tocar el resto de la lista. La lista es de una semana, así que su tamaño está acotado por el plan.                                         |

Embeber da escrituras atómicas por documento: renombrar un ingrediente, marcar una comida o
tachar un ítem es un único `updateOne` que no puede dejar el agregado a medias. También da una
sola lectura por pantalla, sin `$lookup` ni consultas adicionales para pintar la receta, el plan
o la lista.

Los ítems de la lista llevan `_id` propio aunque estén embebidos: el cliente marca uno concreto,
y ese identificador es el que viaja en los eventos de Socket.IO y en las actualizaciones
parciales.

### Qué se referencia

| Campo                                                  | Apunta a     | Por qué                                                                                                                                                                                                                       |
| ------------------------------------------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `households.members[].userId`                          | `users`      | Un usuario pertenece a varios hogares y un hogar tiene varios miembros: es una relación N:M que no cabe en un documento sin duplicar al usuario.                                                                              |
| `recipes.householdId`                                  | `households` | La receta es un agregado propio: se busca, se pagina y se comparte entre miembros del hogar. Duplicarla dentro del hogar la haría crecer sin límite.                                                                          |
| `meal-plans.householdId`, `shopping-list.householdId`  | `households` | Igual que la receta: el hogar es el límite de aislamiento y cada agregado se consulta por separado.                                                                                                                           |
| `meal-plans.slots[].recipeId`                          | `recipes`    | El plan guarda **qué** receta se cocina, no una copia de sus ingredientes y pasos. Si la receta cambia, el plan muestra la versión nueva. Al leer el plan, el servicio resuelve título e imagen de las recetas referenciadas. |
| `shopping-list.items[].checkedBy`, `recipes.createdBy` | `users`      | Se guarda quién hizo la acción, no una copia del perfil.                                                                                                                                                                      |

Se referencia lo que crece sin límite, lo que se edita por su cuenta, lo que se consulta con sus
propios filtros e índices y lo que se comparte entre agregados. Las recetas no se copian dentro
del plan porque una receta puede estar en muchos planes y semanas, y su texto de búsqueda vive
en su propia colección con su índice de texto.

La lista de la compra sí **copia** nombre, cantidad y unidad de los ingredientes al generarse
(`source: 'plan'`): es una foto del plan en ese momento y se edita de forma independiente, así
que un cambio posterior en la receta no debe alterar una lista que el usuario ya está usando.

### Consecuencias

- Las operaciones que cruzan documentos necesitan transacción (el `docker-compose.yml` levanta
  Mongo como replica set de un nodo precisamente por esto). Por ejemplo, borrar una receta debe
  decidir qué pasa con los slots del plan que la referencian dentro de la misma transacción.
- Referenciar obliga a resolver las referencias al leer (una consulta extra o un `$lookup`
  acotado por `householdId`); el coste se paga en lectura y se ahorra en escritura y
  consistencia.
- Todos los agregados llevan `householdId` aunque su dueño sea un usuario: es la clave que los
  repositorios añaden **siempre** al filtro para que un miembro no vea datos de otro hogar.
- Un array embebido no puede crecer sin control: si en el futuro una receta admitiera cientos de
  ingredientes o la lista acumulara varias semanas, pasarían a ser su propia colección.

## Por qué Fastify y no Express

La API arranca con `NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter())`
en `backend/src/main.ts`. Express sigue siendo el adaptador por defecto de Nest, pero aquí se
cambia por estas razones:

- **Rendimiento**: Fastify gestiona más peticiones por segundo y con menos memoria que Express en
  cargas JSON pequeñas, que es el perfil de esta API (listas, planes y marcas de la compra).
- **Serialización por esquema**: Fastify compila esquemas JSON a serializadores, así que las
  respuestas se generan sin recorrer objetos genéricos. Encaja con el sobre de error y con los
  DTOs validados que se añaden más adelante.
- **Ecosistema de plugins con primera parte del framework**: `@fastify/cookie`,
  `@fastify/helmet`, `@fastify/rate-limit` y `@fastify/static` resuelven cookies, CSP, cuerpo
  máximo y `trustProxy` sin capas de compatibilidad. Todo lo que la app necesita (CORS con
  credenciales, CSP estricta, límite de cuerpo de 1 MiB, IP real detrás de Caddy) se configura
  sobre el objeto `FastifyInstance`.
- **Tipado**: `NestFastifyApplication` expone `app.getHttpAdapter().getInstance()`, de modo que
  los hooks y plugins se registran con los tipos de Fastify y no con `any`.
- **Un solo adaptador en todas partes**: los tests e2e crean la app con el mismo `FastifyAdapter`,
  así que lo que se prueba es el servidor real y no una variante Express.

Consecuencias que conviene tener presentes:

- `@nestjs/platform-express` y los middlewares de Express no se usan; el andamiaje los trajo por
  defecto y se han retirado. Cualquier middleware nuevo debe ser un plugin de Fastify.
- Los controladores no cambian: Nest abstrae el adaptador. Lo que sí es específico son los
  `@Res()`/`@Req()` sin `passthrough`, que aquí se evitan a favor del valor de retorno.
- Fastify no escucha en `localhost` por defecto de la misma forma: `main.ts` pasa `0.0.0.0` para
  que el contenedor sea accesible desde fuera.
- `NestJS Observe` y `node:inspector` funcionan igual; el adaptador solo afecta a la capa HTTP.

## Configuración y secretos

La configuración vive en `backend/src/config/` y se carga con un `ConfigModule` global
(`isGlobal: true`, `cache: true`).

- **`env.validation.ts`** define `EnvironmentVariables` con `class-validator` y una función
  `validateEnvironment` que se pasa a `ConfigModule.forRoot({ validate })`. Si falta una variable,
  una URL no tiene el esquema correcto, `SMTP_PORT` no es un puerto o un secreto JWT tiene menos
  de 32 caracteres, la aplicación **no arranca** y el mensaje lista las variables que fallan. Se
  valida con `stopAtFirstError` para no repetir el mismo campo.
- **Una sección por concern** con `registerAs`: `appConfig`, `databaseConfig`, `authConfig`,
  `storageConfig` y `mailConfig`. Los consumidores inyectan la sección con
  `@Inject(authConfig.KEY)` y el tipo `AuthConfig` (`ConfigType<typeof authConfig>`), no leen
  `process.env` sueltos; los helpers `requireEnv`/`envOrDefault`/`numberEnvOrDefault` de
  `env.ts` convierten el `string | undefined` al tipo esperado.
- **Secretos desde fichero**: cualquier `S3_ACCESS_KEY_FILE`, `S3_SECRET_KEY_FILE`,
  `JWT_ACCESS_SECRET_FILE` o `JWT_REFRESH_SECRET_FILE` se lee **antes** de validar y su contenido
  se asigna a la variable sin sufijo (y a `process.env`, para las fábricas y los paquetes de
  terceros). **El valor plano gana**: si existe la variable sin sufijo, el `_FILE` se ignora. Un
  fichero inexistente o vacío aborta el arranque. Es el patrón que usan los Docker secrets en
  producción.
- **Dónde está el `.env`**: en desarrollo, en la raíz del repo (`envFilePath` apunta a él); dentro
  de Docker no se copia y las variables llegan del `environment` del compose. Los tests e2e
  rellenan valores por defecto en `backend/test/setup-env.ts` sin pisar los del entorno.
- **Cambiar un secreto exige reiniciar**: `cache: true` evita leer el entorno en cada acceso.

## Errores de la API

Todas las respuestas de error tienen la misma forma, definida en
`@recipe-planner/contracts` como `ErrorResponse`:

```json
{ "error": { "code": "NOT_FOUND", "message": "No existe el hogar", "details": [] } }
```

- **`AppException`** (`common/exceptions/`) lleva `status`, un `code` del catálogo compartido,
  un `message` para el cliente y `details` por campo. Los servicios la lanzan sin conocer HTTP.
- **`AllExceptionsFilter`** está registrado como `APP_FILTER` global, así que ningún controlador
  puede devolver otra forma de error. Traduce:

| Entrada                                     | Salida                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| `AppException`                              | su `status`, `code`, `message` y `details`                                |
| 400 de `ValidationPipe` (lista de mensajes) | 400 `VALIDATION_ERROR` con un detalle por propiedad (`field` + `message`) |
| `HttpException` 400/401/403/404/409/429     | su estado y el código correspondiente                                     |
| `HttpException` 5xx                         | mismo estado, código `INTERNAL_ERROR`, mensaje genérico                   |
| Error E11000 de Mongo                       | 409 `CONFLICT`                                                            |
| Cualquier otro error                        | 500 `INTERNAL_ERROR` con `Error interno del servidor`                     |

- **Nunca se filtra el stack**: los 5xx se registran en pino con `err` (donde sí queda el stack y
  la causa) y al cliente solo le llega el mensaje genérico. La respuesta siempre incluye
  `details`, aunque sea `[]`.
- Los códigos viven en `ERROR_CODES`, así que añadir uno nuevo obliga a tocar el contrato
  compartido y, por tanto, a compilarlo antes que la API (`npm run build` de la raíz ya lo hace y
  el Dockerfile de desarrollo lo construye dentro de la imagen).

## Salud y dependencias

`GET /api/health` (Terminus) comprueba Mongo, Redis y el bucket de MinIO y responde **200** si
todo está arriba o **503** si algo falla. Cada comprobación tiene un **timeout de 2 s**
(`HEALTH_CHECK_TIMEOUT_MS`), así que una dependencia colgada no bloquea la respuesta.

- **Mongo**: `MongooseHealthIndicator.pingCheck` ejecuta `ping` sobre la conexión de Mongoose.
- **Redis**: `RedisHealthIndicator` envía un `PING` con el cliente compartido.
- **MinIO/S3**: `StorageHealthIndicator` hace `HeadBucket` del bucket configurado, que comprueba
  existencia y permisos sin descargar nada.

El cuerpo mantiene el formato de Terminus (`status`, `info`, `error`, `details`) **también en el
503**, para saber qué dependencia falla. Para eso el controlador captura la
`ServiceUnavailableException` de Terminus y fija el estado: el `AllExceptionsFilter` convertiría
cualquier 5xx en el sobre genérico `INTERNAL_ERROR` y perdería esos detalles. Es la única ruta que
no usa el sobre de error, porque es un endpoint operativo que consume el orquestador, no el
frontend.

Los clientes viven en módulos globales para que los usen los módulos de dominio:

| Módulo           | Qué expone                                                                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DatabaseModule` | conexión de Mongoose. `lazyConnection` deja arrancar sin Mongo (el health responde 503) y un listener de `error` evita que un fallo de conexión tumbe el proceso |
| `RedisModule`    | token `REDIS_CLIENT` (`ioredis`). `enableOfflineQueue: false` hace que un comando falle al instante si Redis está caído, en lugar de esperar en cola             |
| `StorageModule`  | token `S3_CLIENT` (`@aws-sdk/client-s3`) apuntando a `S3_ENDPOINT`, con `forcePathStyle` para MinIO                                                              |

Todas las rutas cuelgan de `/api`: `configureApp` (`app.setup.ts`) aplica el prefijo global y lo
comparten `main.ts` y los tests e2e, para que se prueben las mismas rutas que se despliegan.

## Apagado ordenado

`main.ts` activa `app.enableShutdownHooks([], { useProcessExit: true })`: `SIGTERM` y `SIGINT`
llenan el mismo camino que `app.close()`. La secuencia de Nest es:

1. `onModuleDestroy` de cada módulo.
2. `beforeApplicationShutdown`: Terminus marca el estado como `shutting_down`, así que
   `/api/health` responde 503 mientras se drena.
3. Se cierra el servidor HTTP: Fastify deja de aceptar conexiones y espera a las peticiones en
   curso (las nuevas reciben 503).
4. `onApplicationShutdown`: corre `ShutdownService`, que cierra los recursos en orden.

`ShutdownService` (`src/shutdown/`) es un registro global de tareas. Cada módulo registra la
suya en `onModuleInit` con un orden de `SHUTDOWN_ORDER`:

| Orden | Recurso                | Estado                                                                                                                                |
| ----- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 10    | `realtime` (Socket.IO) | reservado para la fase de tiempo real                                                                                                 |
| 20    | `queues` (BullMQ)      | reservado para la fase de colas                                                                                                       |
| 30    | Redis                  | registrado: `quit()` si está conectado; `disconnect()` si está caído o reconectando, para no esperar una conexión que puede no llegar |
| 40    | MongoDB                | registrado: `connection.close()`. `@nestjs/mongoose` también cierra en su hook; la llamada es idempotente y así queda en el log       |

Las tareas se ejecutan en serie, en orden ascendente. Si una falla, el error se registra y se
sigue con las demás: un recurso que no cierra no debe dejar abiertos los otros. Una segunda
señal durante el apagado no repite la secuencia.

Los módulos de sockets y colas aún no existen; cuando se añadan deben registrar su cierre con
`SHUTDOWN_ORDER.realtime` y `SHUTDOWN_ORDER.queues` en lugar de implementar su propio hook, para
que dejen de aceptar trabajo antes de que Redis y Mongo se cierren.

`useProcessExit` hace que el proceso termine con código 0 después de los hooks (en vez de
re-lanzarse la señal): eso dispara el evento `exit` y pino puede vaciar sus buffers antes de
salir.

## Sesión: access token y refresh rotatorio

La sesión usa dos credenciales con trabajos distintos. El **access token** autoriza cada
petición: es un JWT firmado con `JWT_ACCESS_SECRET`, dura 15 minutos (`ACCESS_TOKEN_TTL`) y se
verifica sin tocar la base. El **refresh token** solo sirve para renovar la sesión: es un valor
opaco de 256 bits generado con un CSPRNG, dura 30 días (`REFRESH_TOKEN_TTL`) y su estado vive en
Mongo, una fila por token emitido. El access token es barato de comprobar pero no se puede
revocar antes de caducar; el refresh token es el que se invalida de verdad.

### Cookies

| Cookie          | Contenido                                       | Duración | `Path`              |
| --------------- | ----------------------------------------------- | -------- | ------------------- |
| `access_token`  | JWT firmado (`sub`, `fid`, `iat`, `exp`)        | 15 min   | `/api`              |
| `refresh_token` | cadena aleatoria opaca, sin estructura ni firma | 30 días  | `/api/auth/refresh` |

Las dos son `httpOnly` (el JavaScript del frontend no las lee), `SameSite=Lax` y `Secure` fuera de
desarrollo, y no llevan `Domain`: son host-only. `Path` no es un control de acceso —el cliente
puede enviar una cookie a donde quiera—, sino una reducción de superficie:

- `Path=/api` en el access token hace que solo viaje a la API. En el mismo origen no se envía al
  pedir HTML, JS o imágenes del frontend, así que no acaba en logs, cachés ni peticiones que no lo
  necesitan.
- `Path=/api/auth/refresh` en el refresh token es todavía más estrecho: solo lo recibe el endpoint
  que lo consume. Ningún otro controlador puede leerlo por accidente ni reenviarlo, y no viaja en
  cada petición autenticada.
- El logout borra las dos cookies repitiendo su `Path` y con `Max-Age=0`; el navegador solo
  elimina una cookie si coinciden nombre, dominio y path.
- `SameSite=Lax` impide que un POST cross-site lleve las cookies, y CORS solo permite el origen de
  `FRONTEND_URL`; entre las dos cosas, un formulario de otro sitio no puede refrescar ni cerrar la
  sesión del usuario.

El refresh token no lleva firma: no hace falta demostrar que lo emitió el servidor, porque la
validez la decide la fila de `refresh_sessions`. Un valor aleatorio sin datos dentro no se puede
leer, adivinar ni reutilizar tras revocarlo.

El access token lleva `fid`, el `familyId` de la sesión, además de `sub`, `iat` y `exp`. Es un
identificador de sesión, no un secreto. Hace falta porque la cookie de refresh tiene un `Path` tan
estrecho que el navegador no la envía a `/api/auth/logout`: el logout identifica la familia que
debe revocar leyendo `fid` del access token, que sí llega a todas las rutas de `/api`.

### Modelo `RefreshSession`

Colección `refresh_sessions`, un documento por token emitido:

| Campo       | Tipo            | Significado                                                            |
| ----------- | --------------- | ---------------------------------------------------------------------- |
| `familyId`  | `string` (UUID) | cadena de rotaciones a la que pertenece el token; la abre el login     |
| `userId`    | `ObjectId`      | dueño de la sesión, referencia a `users`                               |
| `tokenHash` | `string`        | SHA-256 del token en claro; el token nunca se guarda                   |
| `expiresAt` | `Date`          | `now + 30 días` en el momento de emitirlo                              |
| `usedAt`    | `Date \| null`  | cuándo se canjeó; `null` mientras sigue siendo válido                  |
| `revokedAt` | `Date \| null`  | cuándo se revocó la fila (por logout o por detección de reutilización) |
| `createdAt` | `Date`          | cuándo se emitió, para auditoría y para ordenar la familia             |

Índices:

- **Único en `tokenHash`**: el refresh busca por igualdad y no puede haber dos filas con el mismo
  hash.
- **`familyId`**: revocar una familia es un `updateMany` por este campo.
- **TTL en `expiresAt`** (`expireAfterSeconds: 0`): Mongo borra las filas caducadas como limpieza.
  El TTL corre cada ~60 s, así que **no es seguridad**: al leer siempre se comprueba `expiresAt`.
  Una fila caducada que aún no se ha borrado produce 401 igual.

Se guarda el hash y no el token para que una copia de la base (backup, dump, acceso de lectura) no
permita suplantar sesiones. Es un hash rápido, sin sal ni KDF lento, porque el token ya tiene 256
bits de entropía: no hay diccionario que probar y una sal impediría buscar por igualdad. Es el
mismo criterio que separa el hash de contraseñas (lento, con sal) del hash de un token aleatorio.

La familia es lo que permite detectar robo. Cada login o registro abre una familia nueva y cada
refresh emite el siguiente eslabón **con el mismo `familyId`**; por tanto, todos los tokens de una
sesión están relacionados y se pueden revocar juntos. Dos dispositivos son dos familias, y cerrar
sesión en uno no afecta al otro.

### Flujo de rotación

1. **Login o registro**: se genera un `familyId` nuevo y un refresh token aleatorio; se inserta la
   fila con su hash, `expiresAt` a 30 días y `usedAt`/`revokedAt` en `null`. Se firma el access
   token y se escriben las dos cookies.
2. **`POST /api/auth/refresh`**: se lee la cookie, se calcula el hash y se consume el token con una
   única operación atómica:

   ```text
   findOneAndUpdate(
     { tokenHash, usedAt: null, revokedAt: null, expiresAt: { $gt: now } },
     { $set: { usedAt: now } },
   )
   ```

   Que la condición incluya `usedAt: null` es lo que hace el token de un solo uso: si dos
   peticiones llegan a la vez, solo una encuentra la fila y la marca; la otra no puede canjearla.
   Si la actualización no encuentra fila, se lee por `tokenHash` solo para clasificar el motivo
   (la tabla siguiente); esa lectura decide la respuesta y el efecto, pero nunca acepta el token.
   La transacción se ejecuta con `withTransaction`, que reintenta los conflictos de escritura: si
   dos peticiones compiten por el mismo token, una confirma y la otra vuelve a empezar, ya ve
   `usedAt` y revoca la familia.

3. Si la fila se consumió, se inserta el siguiente token de la misma familia (`familyId` igual,
   hash nuevo, `expiresAt` nuevo) y se responden 204 con las cookies actualizadas: access token
   nuevo y refresh token nuevo con los mismos `Path` y duración.
4. **Logout**: se marca `revokedAt` en toda la familia con un `updateMany` y se borran las cookies.
   El refresh robado deja de valer de inmediato.

Qué ocurre cuando el token no se puede canjear:

| Situación                                 | Respuesta              | Efecto                                                                                                         |
| ----------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| No hay cookie o el hash no existe         | 401 `UNAUTHORIZED`     | nada                                                                                                           |
| `expiresAt` ya pasó                       | 401 `TOKEN_EXPIRED`    | nada; la fila la borrará el TTL                                                                                |
| `revokedAt` no es `null`                  | 401 `UNAUTHORIZED`     | nada                                                                                                           |
| `usedAt` no es `null` (token ya canjeado) | 401 `UNAUTHORIZED`     | **se revoca la familia entera**: alguien reutilizó un token que ya se había cambiado, señal de robo o de copia |
| Fila válida y sin usar                    | 204 con cookies nuevas | se marca `usedAt` y se emite el siguiente eslabón                                                              |

La reutilización se registra como evento de seguridad con `userId`, `familyId`, `requestId` e IP,
nunca con el token ni su hash. No se distingue en la respuesta entre «no existe», «revocado» y
«reutilizado»: el cliente solo sabe que la sesión terminó y debe volver a autenticarse.

### Consecuencias

- **Un refresh token sirve una sola vez.** Si lo roban, el ladrón y el cliente legítimo compiten por
  el siguiente eslabón; en cuanto uno de los dos usa el token que el otro ya canjeó, la familia
  entera cae. Es lo que convierte un robo silencioso en un cierre de sesión visible.
- **Consumir y emitir van en la misma transacción.** Son dos escrituras (marcar `usedAt` e insertar
  el nuevo token); si el proceso muere entre ambas, la transacción se aborta y el token anterior
  sigue válido. Nunca queda un token consumido sin sucesor. El replica set de Mongo que ya exige
  el proyecto permite hacerlo atómico.
- **Dos refresh en paralelo son indistinguibles de un robo.** El backend no añade una ventana de
  gracia: el segundo en llegar revoca la familia. El frontend debe hacer _single-flight_ —una sola
  promesa de refresh en vuelo, compartida por todas las peticiones que reciben 401— y reintentar
  cada petición una vez. Sin eso, abrir dos pestañas a la vez puede cerrar la sesión.
- **Revocar no invalida el access token actual.** Sobrevive hasta 15 minutos, que es el precio de
  verificarlo sin base de datos; por eso su TTL es corto y no lleva roles ni `householdId`: la
  autorización por hogar se resuelve en cada petición, y un cambio de rol no espera a que caduque
  un claim viejo.
- **El TTL es limpieza, no seguridad.** Las comprobaciones de `expiresAt` y `revokedAt` se hacen
  siempre al leer; que Mongo tarde en borrar una fila no reabre una sesión.

## CORS, cabeceras de seguridad y cookies

Todo se registra en `configureApp` (`app.setup.ts`), compartido por `main.ts` y los e2e:

- **CORS solo para `FRONTEND_URL`**, con `credentials: true` porque la sesión viaja en cookies
  `httpOnly`. Se usa una función que compara el `Origin` con `FRONTEND_URL` (sin barra final) y
  solo entonces devuelve las cabeceras; otro origen no recibe ninguna. Las peticiones sin
  `Origin` (curl, health del orquestador, servidor a servidor) no son CORS y pasan igual.
  `X-Request-Id` va en `Access-Control-Expose-Headers` para que el frontend pueda leerlo, y el
  preflight se cachea 12 h.
- **Helmet con CSP estricta**: `default-src 'none'` (con `useDefaults: false`, para no heredar
  `'self'`), `base-uri`, `form-action` y `frame-ancestors` en `'none'`. La API solo devuelve JSON,
  así que permitir scripts o estilos sería permitir algo que nunca debe existir en una respuesta.
  Helmet añade además `X-Content-Type-Options: nosniff`, `X-Frame-Options` y
  `Referrer-Policy: no-referrer`.
- **`@fastify/cookie`** deja `request.cookies` y `reply.setCookie()` disponibles para la sesión
  (`httpOnly`, `SameSite=Lax`). Ninguna cookie se firma con el secreto del plugin: el access token
  es un JWT que ya lleva su propia firma y el refresh token es opaco y se valida contra
  `refresh_sessions` (ver «Sesión: access token y refresh rotatorio»).

`fastify` es dependencia directa del backend: el código importa sus tipos (`FastifyRequest`,
`FastifyReply`) y `@fastify/cookie` aumenta el módulo `fastify` para declarar `cookies` y
`setCookie`; con el paquete solo como dependencia transitiva, esa ampliación no se aplicaba.

## Validación

La validación de entrada es global: `createValidationPipe()` (`common/pipes/validation.pipe.ts`) se
registra como `APP_PIPE` en `AppModule`, así que las apps de test que importan el módulo también la
reciben. Opciones:

- `whitelist: true` y `forbidNonWhitelisted: true`: una propiedad que no está en el DTO no se ignora,
  se responde 400. Así un campo mal escrito (`servigs`) no pasa desapercibido.
- `transform: true`: aplica `@Type` de `class-transformer`, de modo que `"4"` llega al controlador
  como `4` y los `@Param`/`@Query` se convierten a su tipo.
- `stopAtFirstError: false`: informa de todos los campos que fallan en una sola respuesta.

El `exceptionFactory` no devuelve el `BadRequestException` de Nest: construye una `AppException` con
`VALIDATION_ERROR` y un detalle por propiedad. `toDetails` aplana el árbol de errores de
`class-validator`, así que un DTO anidado informa de `ingredients.0.quantity` y no solo de
`ingredients`. De cada propiedad se toma el primer mensaje, suficiente para marcar el campo en el
formulario.

**`ParseObjectIdPipe`** (`common/pipes/parse-object-id.pipe.ts`) valida los parámetros de ruta que
son `ObjectId` de Mongo: 24 caracteres hexadecimales, la misma comprobación que
`ObjectId.isValid` pero sin depender del driver, para poder usarlo antes de que exista el modelo. Un
id mal formado es un 400 `VALIDATION_ERROR` con el nombre del parámetro en `details`, no un 500 de
base de datos. Se usa por parámetro: `@Param('recipeId', ParseObjectIdPipe) recipeId: string`.

## Logging y correlación de peticiones

La API registra con `nestjs-pino` (`LoggerModule.forRootAsync`), enlazado en `main.ts` con
`bufferLogs: true` + `app.useLogger(app.get(Logger))` para que incluso los logs de arranque pasen
por pino.

- **Formato**: en desarrollo (`APP_ENV=development`) se usa `pino-pretty` en una línea con hora
  legible; en `test` y `production` se emite JSON, que es lo que consumen el colector y Observe. El
  nivel sale de `LOG_LEVEL`, ya validado por el esquema del entorno.
- **Redacción**: `redact` tapa `req.headers.cookie`, `req.headers.authorization` y
  `res.headers["set-cookie"]` con `[Redacted]` antes de serializar. Como los tokens viven en
  cookies `httpOnly`, esto evita filtrarlos al depurar. Hay un test que serializa una entrada con
  cookie, `Authorization` y `Set-Cookie` y comprueba que ningún valor aparece en la salida.
- **`X-Request-Id`**: se resuelve en el adaptador Fastify (`request-id.ts`) porque Fastify rellena
  `request.id` antes de que corra el middleware y `pino-http` respeta ese id sin llamar a su
  `genReqId`. La función reutiliza la cabecera entrante (recortada) o genera un UUID, y un hook
  `onRequest` devuelve el id en la respuesta. Así el mismo id aparece en el log de la petición, en
  la respuesta y en los logs del frontend, que lo reenvía como `X-Request-Id`.

## Reglas del workspace

- Un único `package-lock.json` en la raíz; los workspaces (`backend`, `frontend`, `e2e`,
  `packages/*`) no tienen lockfile propio.
- Los paquetes compartidos se compilan antes que sus consumidores: `npm run build` en la raíz
  recorre los workspaces en orden.
