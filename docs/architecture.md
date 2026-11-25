# Arquitectura

## Qué va en `packages/contracts` y qué no

`@recipe-planner/contracts` es el contrato compartido entre la API NestJS, el worker y la web
Next.js. Contiene **solo datos**: tipos, uniones, constantes y funciones puras de comprobación de
tipos que se pueden ejecutar igual en Node y en el navegador, sin dependencias externas.

### Sí va

- **Eventos de Socket.IO**: el namespace (`/realtime`), los nombres de evento
  (`shopping.item.updated`, `shopping.list.regenerated`, `meal-plan.updated`,
  `import.finished`, `import.failed`, `session.expired`) y la forma de su carga útil. Emisor y
  receptor comparten la misma definición, así que renombrar un evento o cambiar un campo rompe
  la compilación en ambos lados.
- **Códigos de error**: los valores de `error.code` del sobre común
  (`VALIDATION_ERROR`, `TOKEN_EXPIRED`, `NOT_FOUND`, …), el tipo `ErrorResponse` y la forma de
  `details`. El cliente decide a partir del código; el texto del mensaje no es contrato.
- **Catálogo de unidades**: la lista de unidades permitidas (`g`, `kg`, `ml`, `l`, `tsp`,
  `tbsp`, `cup`, `unit`, `pinch`), su dimensión (masa, volumen, cantidad) y su factor a la
  unidad base. Lo consumen los DTOs para validar, la web para el selector y el generador de la
  lista de la compra.
- **Operaciones de unidades**: `normalize`, `add` y `scale` son funciones puras sobre ese
  catálogo, sin acceso a base de datos, red ni reloj. Viven aquí para que API, worker y web
  calculen igual; `packages/contracts/units-cases.json` fija los casos que comprueban ambos
  lados.
- **Comprobaciones de tipos** como `isUnit()` o `unitsOfDimension()`: recorren solo las
  constantes anteriores.
- Tipos de dominio estables que ambos lados necesitan tal cual: `WeekStart`, `MealSlot`,
  `MemberRef`.

### No va

- **Lógica de servidor**: reglas de negocio, `ShoppingListGenerator`, autorización o cualquier
  cosa que consulte base de datos, Redis, MinIO o el reloj. Esas funciones viven en los
  servicios del backend; el frontend recibe los resultados ya calculados por la API.
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
| `media`      | URLs prefirmadas de subida y lectura, miniaturas y borrado      |
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
lecturas, las actualizaciones de un solo documento con operadores posicionales y **siempre**
filtran por `householdId` para que el aislamiento entre hogares no dependa del llamador. No
contienen reglas de negocio: si hay que decidir algo, se decide en el servicio.

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
| `shopping-list` | `items: [{ _id, name, quantity, unit, checked, checkedBy, source }]`  | Marcar un ítem es actualizar un elemento del array con el operador posicional `$`, sin tocar el resto de la lista. La lista es de una semana, así que su tamaño está acotado por el plan.                           |

Embeber da escrituras atómicas por documento: renombrar un ingrediente, marcar una comida o
tachar un ítem es un único `updateOne` que no puede dejar el agregado a medias. También da una
sola lectura por pantalla, sin `$lookup` ni consultas adicionales para pintar la receta, el plan
o la lista.

Los ítems de la lista llevan `_id` propio aunque estén embebidos: el cliente marca uno concreto,
y ese identificador es el que viaja en los eventos de Socket.IO y en las actualizaciones
parciales.

### Qué se referencia

| Campo                                                  | Apunta a     | Por qué                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `households.members[].userId`                          | `users`      | Un usuario pertenece a varios hogares y un hogar tiene varios miembros: es una relación N:M que no cabe en un documento sin duplicar al usuario.                                                                                                                              |
| `recipes.householdId`                                  | `households` | La receta es un agregado propio: se busca, se pagina y se comparte entre miembros del hogar. Duplicarla dentro del hogar la haría crecer sin límite.                                                                                                                          |
| `meal-plans.householdId`, `shopping-list.householdId`  | `households` | Igual que la receta: el hogar es el límite de aislamiento y cada agregado se consulta por separado.                                                                                                                                                                           |
| `meal-plans.slots[].recipeId`                          | `recipes`    | El plan guarda **qué** receta se cocina, no una copia de sus ingredientes y pasos. Si la receta cambia, el plan muestra la versión nueva. La API devuelve los `recipeId`; título e imagen los resuelve el frontend en `src/server/plan-data.ts`, que tolera recetas borradas. |
| `shopping-list.items[].checkedBy`, `recipes.createdBy` | `users`      | Se guarda quién hizo la acción, no una copia del perfil.                                                                                                                                                                                                                      |

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
- Referenciar obliga a resolver las referencias al leer. Hoy no hay `$lookup`: la generación de
  la lista hace un `findById` por slot (`shopping-list.generator.ts`) y el loader del plan pide
  cada receta referenciada (`src/server/plan-data.ts`). Son N+1 acotados por los 21 slots de una
  semana; agruparlos con `$in` es trabajo pendiente.
- Todos los agregados llevan `householdId` aunque su dueño sea un usuario: es la clave que los
  repositorios añaden **siempre** al filtro para que un miembro no vea datos de otro hogar.
- Un array embebido no puede crecer sin control: si en el futuro una receta admitiera cientos de
  ingredientes o la lista acumulara varias semanas, pasarían a ser su propia colección.

## Actualizaciones atómicas de arrays

Los arrays embebidos se editan **dentro del documento padre, en una sola operación**. Así se
evita el clásico read-modify-write en el que dos pestañas leen la misma versión y la segunda
sobrescribe lo que marcó la primera.

### Lista de la compra

`ShoppingListsRepository.updateItem()` usa `findOneAndUpdate` con el filtro
`{ householdId, weekStart, 'items._id': itemId }` y aplica `$set` sobre `items.$.quantity`,
`items.$.checked` e `items.$.checkedBy`; al desmarcar usa `$unset` para borrar `checkedBy`, porque
el dato deja de ser cierto. El operador **posicional `$`** selecciona el elemento coincidente:
solo se reescribe ese subdocumento y la operación es atómica a nivel de documento. La llamada
añade `runValidators: true` y `returnDocument: 'after'`.

> El comentario del repositorio dice «usando `arrayFilters`», pero el código usa el operador
> posicional `$`. La atomicidad la garantiza Mongo, no un `arrayFilters`.

La regeneración (`replaceItems`) sí sustituye el array completo con `$set` y `upsert`; los ítems
manuales se añaden con `$push`. Después de marcar o regenerar, `ShoppingListsService` publica
`shopping.item.updated` o `shopping.list.regenerated` con `householdId`, semana y `version`.

### Versión y eventos

El esquema declara `versionKey: 'version'` y `optimisticConcurrency: true`, y los eventos llevan
`list.version`. El cliente descarta eventos con versión menor (`src/lib/shopping-cache.ts`) y al
reconectar invalida la consulta. **Pero las actualizaciones posicionales no incrementan
`version`**: el control optimista de Mongoose no se activa en un `findOneAndUpdate` sin filtro de
versión, así que el número emitido suele repetirse. Es una limitación conocida: el control de
concurrencia real es la escritura atómica de Mongo, no el contador.

La regeneración evita además bucles entre pestañas: `sameContent` compara el contenido anterior y
solo publica el evento si cambió, porque cada cliente que lo recibe invalida su caché y volvería
a regenerar la lista.

### Otros arrays

- `meal-plans`: `MealPlansService` hace read-modify-write con `replaceSlots` (un `$set` del array
  completo), aunque el comentario del esquema menciona `arrayFilters`. El tamaño está acotado a
  21 slots, así que el riesgo de sobrescritura es pequeño.
- `households`: cambiar un rol usa `$set: { 'members.$.role': role }` con filtro
  `{ _id, 'members.userId': userId }`; el alta y la baja usan `$push` y `$pull`.

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

## URLs prefirmadas

Las imágenes se suben **directamente del navegador a MinIO/S3**: el backend solo firma y
verifica, así que el binario nunca pasa por la API.

- **Subida.** `POST /api/households/:householdId/media/upload-url` devuelve
  `{ key, url, fields, expiresAt }` de `createPresignedPost` (`MediaService.createUploadUrl`).
  La clave es `pending/{householdId}/{uuid}.{jpg|png|webp}`, el `Content-Type` queda fijado
  por una condición `eq`, el tamaño se limita con `content-length-range [1, dto.size]` y la URL
  expira en 300 s (`UPLOAD_URL_TTL_SECONDS`). El prefijo del hogar es la primera barrera de
  aislamiento y el guard de membresía comprueba la ruta antes de firmar nada. La subida vive en
  `pending/` hasta que se confirma: así la regla de ciclo de vida del bucket puede expirar lo
  que nadie confirmó sin tocar ninguna imagen en uso.
- **Confirmación.** `inspectImage` exige que la clave empiece por el prefijo pendiente o por el
  definitivo del hogar, hace `HeadObject` (un 404 se traduce a `NOT_FOUND`), comprueba tamaño
  ≤ 5 MiB y MIME entre JPEG, PNG y WebP, y lee el objeto con `sharp` para obtener anchura y
  altura reales. Si la clave era pendiente, copia el objeto a `households/{householdId}/…`
  (`CopyObject`) y devuelve la clave definitiva: la receta nunca apunta a algo que el ciclo de
  vida pueda borrar. La copia deja el original pendiente en su sitio para que reintentar la
  confirmación siga funcionando; MinIO lo elimina al vencer el plazo.
- **Lectura.** `signImageUrls` firma tres `GetObject` —original, 320 px y 960 px— con TTL de
  300 s **en cada serialización** (`RecipesService.toResponse`). Las URLs no se guardan en Mongo:
  un enlace filtrado deja de servir en cinco minutos. Firmar es local y barato, sin petición al
  bucket. Las variantes las genera el worker en una cola de BullMQ; el borrado encola las tres
  claves y es idempotente. El trabajo de miniaturas lleva un `jobId` determinista por clave de
  imagen (`thumbnailJobId`), así que confirmar dos veces la misma foto —dos pestañas, un
  reintento del navegador— encola un solo trabajo; la cola se limpia por edad y por número
  (`removeOnComplete`/`removeOnFail`).
- **Huérfanos.** Una URL prefirmada que se usa pero nunca se confirma deja un objeto sin receta.
  El worker registra cada hora un trabajo repetible (`media.cleanup-orphans`) que lista
  `pending/` y `households/` con `ListObjectsV2` por páginas, consulta en lote qué claves
  referencian las recetas y borra las que llevan más de 24 h sin dueño. Como red de seguridad,
  `minio-init` importa `infra/minio/lifecycle.json`: la regla expira todo `pending/` al día
  siguiente, de modo que un barrido roto no acumula basura indefinidamente.
- **Exposición pública.** MinIO sirve el bucket bajo `/media` en Caddy, que reenvía la firma sin
  reescribirla. Hay dos clientes S3: el interno (`S3_ENDPOINT`) para `HeadObject`/`GetObject` y
  el público (`S3_PUBLIC_ENDPOINT`) para las URLs que usa el navegador. La comprobación del
  despliegue está en `docs/production.md`.

### Límite en el frontend

El detalle de la receta ya carga sus datos desde el servidor, pero el listado
`src/app/(app)/recipes/page.tsx` sigue siendo un placeholder: construye
`https://minio.example.com/recipes/${recipe.imageKey}` con un `imageKey` que el contrato no
expone y sin `remotePatterns` en `next.config.ts`. Las URLs firmadas (`smallUrl`, `largeUrl`)
aparecen solo como tipo en `src/lib/meal-plan.ts`; ningún `<Image>` las consume todavía.

## Importación desde URL y SSRF

La importación toma una URL del usuario, la descarga en el worker y parsea JSON-LD. El cliente
HTTP de `src/imports/safe-http.client.ts` está diseñado para que esa URL no pueda alcanzar la
red interna:

- **Esquema y puerto.** Solo `http`/`https`, sin credenciales en la URL y solo puertos 80/443.
- **Bloqueo de red.** Una `BlockList` rechaza loopback, redes privadas, link-local (incluida la
  IP de metadatos `169.254.169.254`), CGNAT, rangos de documentación y benchmarking, multicast,
  reservados y sus equivalentes IPv6, más IPv4 embebido en IPv6. `isPublicAddress` decide.
- **DNS rebinding.** Se resuelve el nombre y se validan **todas** las IP devueltas. La conexión
  usa la IP ya validada, con el hostname original solo en `Host` y SNI: no hay una segunda
  resolución entre la comprobación y la petición.
- **Redirecciones.** Máximo 3 saltos (301/302/303/307/308). Cada salto vuelve a validar URL e IP,
  así que un `Location` a una IP interna se rechaza igual que la URL inicial.
- **Cotas.** 5 s para toda la petición (incluidos saltos y lectura del cuerpo), 2 MiB máximo con
  corte incremental, `Accept-Encoding: identity`, solo `Content-Type: text/html` y respuestas
  2xx. Los errores son tipados: `INVALID_URL`, `BLOCKED_HOST`, `TOO_MANY_REDIRECTS`, `TIMEOUT`,
  `TOO_LARGE`, `UNSUPPORTED_CONTENT_TYPE`, `HTTP_ERROR` y `NETWORK_ERROR`.
- **Excepción de test.** Con `APP_ENV=test`, `IMPORT_ALLOWED_HOSTS` permite hosts concretos —en
  E2E, `fixtures`— y omite la comprobación de IP pública para servir el JSON-LD desde la red de
  Compose. Fuera de test la variable se ignora.
- **Pruebas.** `safe-http.client.spec.ts` cubre URLs y literales IP permitidos y bloqueados,
  listas mixtas de DNS, rebinding inicial y en redirección, cotas y tipos de contenido.

El worker publica `import.finished` o, en el último intento, `import.failed`. El diálogo de
importación del frontend aún no escucha esos eventos: es un placeholder (ver «Límites conocidos»).

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

## Caracterización de las respuestas

`backend/test/characterization.e2e-spec.ts` fija en snapshots el JSON exacto de cada endpoint:
el cuerpo de éxito y el sobre de error de cada `code` (400, 401, 403, 404, 409, 429 y 500). No
son especificaciones, son una red de seguridad: si un refactor cambia un campo, un mensaje o un
estado, el snapshot falla y obliga a decidir si el cambio es el buscado.

- Se comparan `status` y `body` juntos, así que mover un error de estado también rompe.
- Antes de comparar se normaliza solo lo que no puede ser determinista: identificadores (se
  aliasan como `<id:1>`, `<id:2>`… por orden de aparición), instantes, códigos de invitación,
  UUIDs de claves de medios, firmas de URLs prefirmadas y `responseTime` del health check.
- Los tests arrancan la app real con los repositorios en memoria de `test/support`, así que los
  valores dependientes de Mongo (versión optimista de la lista, `_id` de subdocumentos) reflejan
  el comportamiento de los dobles, no el de la base de datos.
- Para aceptar un cambio: `npx vitest run --config vitest.config.e2e.ts test/characterization.e2e-spec.ts -u`
  y revisar el diff del `.snap` en la revisión.

## Nombres y payloads de eventos Socket.IO

Los nombres y cargas útiles de los eventos de Socket.IO están definidos en
`packages/contracts/src/events.ts`. Los eventos del namespace `/realtime` son:

- `SESSION_EXPIRED_EVENT = 'session.expired`': avisa que el access token caducó.
  Carga útil: `{ code: 'TOKEN_EXPIRED', message: string }`.
- `SOCKET_EVENTS.shoppingItemUpdated = 'shopping.item.updated'`: notifica un cambio
  de estado de un ítem de la lista de la compra.
- `SOCKET_EVENTS.shoppingListRegenerated = 'shopping.list.regenerated'`: avisa que la
  lista fue regenerada por cambios en el plan semanal.
- `SOCKET_EVENTS.mealPlanUpdated = 'meal-plan.updated'`: notifica huecos actualizados
  del plan semanal.
- `SOCKET_EVENTS.importFinished = 'import.finished'`: avisa que una importación terminó
  exitosamente.
- `SOCKET_EVENTS.importFailed = 'import.failed'`: avisa que una importación falló,
  incluyendo el `code` (`IMPORT_FAILED`) y el mensaje de error.

Las interfaces de payload correspondientes están en el mismo archivo:
`ShoppingItemUpdatedPayload`, `ShoppingListRegeneratedPayload`,
`MealPlanUpdatedPayload`, `ImportFinishedPayload`, `ImportFailedPayload`.

## Atributos de las tres cookies

La API usa tres cookies de sesión, cuyos atributos están definidos en
`src/auth/auth.constants.ts` y `src/common/csrf/csrf.constants.ts`:

| Cookie          | `httpOnly` | `sameSite` | `path`              | `maxAge`  | `secure`             |
| --------------- | ---------- | ---------- | ------------------- | --------- | -------------------- |
| `access_token`  | `true`     | `lax`      | `/`                 | `15 min`  | `true` en producción |
| `refresh_token` | `true`     | `lax`      | `/api/auth/refresh` | `30 días` | `true` en producción |
| `csrf_token`    | `false`    | `lax`      | `/`                 | `30 días` | depende del entorno  |

Los dos primeros son escritos por `setSessionCookies` en
`src/auth/session-cookies.ts`. La cookie CSRF es escrita por
`setCsrfCookie` en `src/common/csrf/csrf-cookie.js`. El atributo `secure` se
conoce desde `APP_ENV` (falso en desarrollo, verdadero en producción).

## Códigos de error de auth

Los códigos de error del sobre compartido `{ error: { code, message, details } }`
están definidos en `packages/contracts/src/errors.ts` como `ERROR_CODES`:

- `VALIDATION_ERROR` (400): cuerpo de petición inválido.
- `UNAUTHORIZED` (401): sesión ausente, desconocida o revocada.
- `TOKEN_EXPIRED` (401): access token caducado; el cliente debe refrescar.
- `FORBIDDEN` (403): origen CSRF inválido o rol insuficiente.
- `NOT_FOUND` (404): recurso (hogar, receta, lista, etc.) no existe.
- `CONFLICT` (409): operación que viola restricciones de negocio (ej. el último
  miembro no puede salir del hogar).
- `RATE_LIMITED` (429): throttle global (Redis); no tiene ruta dedicada, se
  caracteriza mediante `AllExceptionsFilter`.
- `INTERNAL_ERROR` (500): excepción inesperada; también se caracteriza mediante
  `AllExceptionsFilter`.

La caracterización de estos códigos en `backend/test/characterization.e2e-spec.ts`
cubre los 6 primeros mediante peticiones e2e reales, y los dos últimos (`RATE_LIMITED`
y `INTERNAL_ERROR`) a través del filtro de excepciones global, ya que ninguna ruta
los produce directamente hoy por día (el throttler no está importado en `AppModule`).

- `IMPORT_FAILED` no viaja en el sobre HTTP: es un estado de trabajo de importación
  y se publica por Socket.IO (`import.failed`).

- Para ver los snapshots generados: `test/__snapshots__/characterization.e2e-spec.ts.snap`.

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
| 10    | `realtime` (Socket.IO) | registrado por `registerRealtimeAdapter`: `adapter.disconnect()`                                                                      |
| 20    | `queues` (BullMQ)      | registrado por `WorkersShutdown`: `close()` de los workers de imágenes e importaciones (idempotente)                                  |
| 30    | Redis                  | registrado: `quit()` si está conectado; `disconnect()` si está caído o reconectando, para no esperar una conexión que puede no llegar |
| 40    | MongoDB                | registrado: `connection.close()`. `@nestjs/mongoose` también cierra en su hook; la llamada es idempotente y así queda en el log       |

Las tareas se ejecutan en serie, en orden ascendente. Si una falla, el error se registra y se
sigue con las demás: un recurso que no cierra no debe dejar abiertos los otros. Una segunda
señal durante el apagado no repite la secuencia. El orden importa: sockets y workers dejan de
aceptar trabajo antes de que se corten Redis y Mongo, para que un trabajo que todavía publica
su resultado pueda reconectar.

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

| Cookie          | Contenido                                       | Duración | `Path` |
| --------------- | ----------------------------------------------- | -------- | ------ |
| `access_token`  | JWT firmado (`sub`, `fid`, `iat`, `exp`)        | 15 min   | `/`    |
| `refresh_token` | cadena aleatoria opaca, sin estructura ni firma | 30 días  | `/`    |
| `csrf_token`    | token del doble submit (legible por JavaScript) | 30 días  | `/`    |

Las dos cookies de sesión son `httpOnly` (el JavaScript del frontend no las lee), `SameSite=Lax`
y `Secure` fuera de desarrollo, y no llevan `Domain`: son host-only. `Path` no es un control de
acceso —el cliente puede enviar una cookie a donde quiera—, sino una reducción de superficie:

- `Path=/` en el access token hace que viaje a la API y al handshake de Socket.IO
  (`/socket.io`), que también lo verifica. Con `Path=/api` el navegador no lo enviaría al
  socket, que es un path hermano, y el gateway no tendría con qué autenticar; sigue siendo
  `httpOnly`, así que el JavaScript de la página no lo lee.
- `Path=/` en el refresh token lo necesita el middleware de Next: renueva la sesión **antes**
  de renderizar una navegación, y para eso tiene que recibir la cookie en la petición a
  `/recipes`, no solo en `/api/auth/refresh`. Con el ámbito estrecho anterior el servidor no
  podía refrescar y la única salida era un salto extra por el navegador. Sigue siendo
  `httpOnly`, ningún otro controlador la lee y solo el endpoint de refresh la consume.
- `Path=/` en `csrf_token` permite al middleware firmar su POST de refresh con el mismo doble
  submit que usa el resto de mutaciones. No es `httpOnly`, pero tampoco es un secreto: su valor
  solo protege si el atacante no puede leerlo desde otro origen, y eso lo garantiza el navegador.
- El logout borra las dos cookies de sesión repitiendo su `Path` y con `Max-Age=0`; el navegador
  solo elimina una cookie si coinciden nombre, dominio y path.
- `SameSite=Lax` impide que un POST cross-site lleve las cookies, y CORS solo permite el origen de
  `FRONTEND_URL`; entre las dos cosas, un formulario de otro sitio no puede refrescar ni cerrar la
  sesión del usuario.

El refresh token no lleva firma: no hace falta demostrar que lo emitió el servidor, porque la
validez la decide la fila de `refresh_sessions`. Un valor aleatorio sin datos dentro no se puede
leer, adivinar ni reutilizar tras revocarlo.

El access token lleva `fid`, el `familyId` de la sesión, además de `sub`, `iat` y `exp`. Es un
identificador de sesión, no un secreto. Hace falta porque el logout identifica la familia que
debe revocar leyendo `fid` del access token; la cookie de refresh solo se usa para rotar y no
hace falta que llegue al endpoint de logout.

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
   `usedAt` y aplica la ventana de gracia de 10 s descrita más abajo.

3. Si la fila se consumió, se inserta el siguiente token de la misma familia (`familyId` igual,
   hash nuevo, `expiresAt` nuevo) y se responden 204 con las cookies actualizadas: access token
   nuevo y refresh token nuevo con los mismos `Path` y duración.
4. **Logout**: se marca `revokedAt` en toda la familia con un `updateMany` y se borran las cookies.
   El refresh robado deja de valer de inmediato.

Qué ocurre cuando el token no se puede canjear:

| Situación                         | Respuesta              | Efecto                                                                                                         |
| --------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| No hay cookie o el hash no existe | 401 `UNAUTHORIZED`     | nada                                                                                                           |
| `revokedAt` no es `null`          | 401 `UNAUTHORIZED`     | nada; una familia revocada no se reabre aunque la fila también esté usada                                      |
| `expiresAt` ya pasó               | 401 `TOKEN_EXPIRED`    | nada; la fila la borrará el TTL; se comprueba antes que `usedAt`                                               |
| `usedAt` de hace menos de 10 s    | 204 con cookies nuevas | gracia: se emite otro eslabón vivo de la misma familia, sin revocar                                            |
| `usedAt` de hace 10 s o más       | 401 `UNAUTHORIZED`     | **se revoca la familia entera**: alguien reutilizó un token que ya se había cambiado, señal de robo o de copia |
| Fila válida y sin usar            | 204 con cookies nuevas | se marca `usedAt` y se emite el siguiente eslabón                                                              |

La decisión y sus alternativas están en
[`docs/adr/0001-ventana-de-gracia-para-refresh.md`](adr/0001-ventana-de-gracia-para-refresh.md).

La reutilización fuera de la ventana se registra como aviso de seguridad con `userId` y
`familyId`, nunca con el token ni su hash. No se distingue en la respuesta entre «no existe»,
«revocado» y «reutilizado»: el cliente solo sabe que la sesión terminó y debe volver a
autenticarse.

### Consecuencias

- **Un refresh token sirve una sola vez, salvo durante los 10 s de gracia.** Si lo roban, el ladrón
  y el cliente legítimo compiten por el siguiente eslabón; pasada la ventana, en cuanto uno de los
  dos usa el token que el otro ya canjeó, la familia entera cae. Es lo que convierte un robo
  silencioso en un cierre de sesión visible.
- **Consumir y emitir van en la misma transacción.** Son dos escrituras (marcar `usedAt` e insertar
  el nuevo token); si el proceso muere entre ambas, la transacción se aborta y el token anterior
  sigue válido. Nunca queda un token consumido sin sucesor. El replica set de Mongo que ya exige
  el proyecto permite hacerlo atómico.
- **Dos refresh en paralelo se aceptan durante 10 s.** El segundo en llegar, al encontrar `usedAt`
  reciente, recibe otro eslabón vivo de la misma familia en lugar de revocarla. Pasada la ventana
  vuelve a valer la detección de robo. El frontend hace _single-flight_ **por pestaña**
  (`src/lib/api-client.ts`): una sola promesa de refresh compartida por las peticiones que reciben
  401 y un único reintento por petición. El _single-flight_ sigue sin cruzar pestañas; la gracia
  es la que cubre ese caso.
- **Revocar no invalida el access token actual.** Sobrevive hasta 15 minutos, que es el precio de
  verificarlo sin base de datos; por eso su TTL es corto y no lleva roles ni `householdId`: la
  autorización por hogar se resuelve en cada petición, y un cambio de rol no espera a que caduque
  un claim viejo.
- **El TTL es limpieza, no seguridad.** Las comprobaciones de `expiresAt` y `revokedAt` se hacen
  siempre al leer; que Mongo tarde en borrar una fila no reabre una sesión.

## Tiempo real

El gateway vive en el namespace `/realtime` (`REALTIME_NAMESPACE` en `contracts`) y no sirve
eventos a quien no esté autenticado:

- **Handshake autenticado.** Un middleware del namespace lee la cookie `access_token` del
  header `Cookie` y la verifica con `AuthTokensService`, el mismo verificador del guard HTTP.
  Si es válida, deja `{ id, familyId }` en `socket.data.user`; el resto del gateway (salas por
  hogar) lo usa sin volver a mirar el token. Un token caducado rechaza con
  `TOKEN_EXPIRED` para que el cliente refresque y reconecte; uno ausente o inválido, con
  `UNAUTHORIZED`. El error viaja en `connect_error` como `{ code, message }`.
- **Caducidad en conexiones largas.** El handshake deja el `exp` del token en el socket y el
  gateway programa su cierre. Al caducar emite `session.expired` con
  `{ code: 'TOKEN_EXPIRED', message }` y desconecta: Socket.IO no permite adjuntar datos al
  `disconnect`, así que el aviso va en un evento propio. El cliente refresca con
  `POST /api/auth/refresh` y llama a `socket.connect()`; el navegador envía la cookie nueva en
  el handshake. El temporizador se cancela si el cliente se desconecta antes.
- **Origin comprobado.** El `Origin` del handshake tiene que ser `FRONTEND_URL`. El navegador
  no deja falsificarlo, así que una página de otro sitio no puede abrir el socket con las
  cookies del usuario; sin `Origin` (clientes que no son navegadores) también se rechaza.
  Socket.IO recibe además el CORS de `FRONTEND_URL` con credenciales para el polling inicial.
- **Adaptador de Redis.** `RedisIoAdapter` sustituye el adaptador local de Nest por
  `@socket.io/redis-adapter` sobre dos conexiones propias de `REDIS_URL` (el cliente
  compartido no puede quedar en modo suscripción). Los eventos se publican en el canal
  `socket.io` de Redis, así que un socket conectado a una réplica recibe lo que originó otra.
  El worker no sirve sockets: publica en el mismo canal con `@socket.io/redis-emitter` y el
  adaptador lo reparte a los clientes de todas las réplicas.
- **Apagado.** El adaptador registra su tarea en `ShutdownService` con `SHUTDOWN_ORDER.realtime`:
  Nest cierra primero el servidor de sockets y después se cierran las conexiones de Redis.
- **La cookie tiene que llegar al handshake.** Por eso el access token usa `Path=/` y no
  `/api`: el socket vive en `/socket.io`, un path hermano. El refresh token también usa `/`
  para que el middleware de Next pueda renovar la sesión en una navegación; el handshake no lo
  lee.

### Salas

Un socket solo recibe lo de sus hogares, y la pertenencia se decide en el servidor: el cliente
no elige salas. Hay dos tipos (`src/realtime/rooms.ts`) y no forman parte de
`packages/contracts`, porque no son un contrato con el frontend.

| Sala             | Quién está dentro                                 | Para qué                                    |
| ---------------- | ------------------------------------------------- | ------------------------------------------- |
| `household:{id}` | todos los sockets de todos los miembros del hogar | repartir los eventos de dominio del hogar   |
| `user:{id}`      | todas las conexiones abiertas de un usuario       | reubicar sus sockets cuando cambia de hogar |

- **Al conectar**, `handleConnection` une el socket a `user:{id}` y después a
  `household:{id}` de cada uno de sus hogares. Entra primero en la sala del usuario para que una
  membresía que cambie mientras se consultan los hogares llegue igualmente: `onJoined`/`onLeft`
  ya alcanzan al socket.
- **Al unirse o salir de un hogar**, `HouseholdsService` avisa a `RealtimeRoomsService`, que
  hace `namespace.in('user:{id}').socketsJoin(...)` o `.socketsLeave(...)`. Con el adaptador de
  Redis eso alcanza también a los sockets conectados a otras réplicas, sin recorrerlos uno a uno
  ni guardar un registro de conexiones. Crear un hogar y aceptar una invitación cuentan como
  entrar.
- **Un fallo de salas no tumba la escritura.** La membresía ya está confirmada cuando se
  actualizan las salas; si el adaptador falla se registra el error y se sigue. El peor caso es
  que ese socket tarde en ver el cambio hasta que se reconecte, que es preferible a devolver un
  error por algo que sí se guardó.
- **`RealtimeRoomsModule` vive aparte de `RealtimeModule`** para evitar un ciclo:
  `RealtimeModule` importa `HouseholdsModule` (necesita los hogares del usuario al conectar) y
  `HouseholdsModule` importa `RealtimeRoomsModule`. En contextos sin gateway (worker, seed) el
  namespace no está y las actualizaciones se omiten.
- **Salir de un hogar** (`POST /api/households/:id/leave`) aplica dos reglas: si se va el
  propietario, el miembro más antiguo pasa a serlo —un hogar sin propietario no podría invitar—;
  y el último miembro no puede salir, porque el hogar quedaría huérfano arrastrando recetas,
  planes y listas (409 `CONFLICT`).

### Eventos

Los servicios de dominio no conocen Socket.IO: emiten a través de `RealtimePublisher`
(`src/realtime/realtime-publisher.ts`), una interfaz con `publish(event, payload)` que recibe
los nombres y las cargas de `packages/contracts` (`SOCKET_EVENTS`). El publicador deduce la
sala del `payload.householdId`, así que un evento nunca se puede emitir a un hogar distinto del
que describe.

| Evento                      | Cuándo                                            | Payload                                          |
| --------------------------- | ------------------------------------------------- | ------------------------------------------------ |
| `shopping.item.updated`     | se marca o edita un ítem de la lista              | semana, ítem, `checked`, quién lo marcó, versión |
| `shopping.list.regenerated` | se regenera la lista desde el plan y la despensa  | semana y versión                                 |
| `meal-plan.updated`         | se asigna o quita una receta de un hueco          | semana y huecos que cambiaron                    |
| `import.finished`           | el worker termina de importar una receta          | hogar, importación y receta                      |
| `import.failed`             | el worker agota los reintentos de una importación | hogar, importación, código y mensaje             |

Una sola implementación (`RealtimePublisherService`) sirve a los dos procesos:

- **API.** El gateway le entrega su namespace en `afterInit` y publica con
  `namespace.to('household:{id}')`. Con el adaptador de Redis, el evento llega a los sockets de
  todas las réplicas.
- **Worker.** No hay gateway ni sockets: publica con `@socket.io/redis-emitter` en el mismo
  canal (`REALTIME_REDIS_KEY`) y namespace. El adaptador de la API lo reparte a las salas.

`publish` es síncrono y no lanza. La escritura que originó el evento ya está confirmada, así que
un fallo al notificar se registra y se sigue: el peor caso es que ese socket tarde en ver el
cambio hasta que recargue o se reconecte. En el worker, `import.failed` solo se publica en el
último intento, para que un 503 pasajero no genere un aviso por cada reintento.

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

### Protección CSRF en mutaciones

Las peticiones que modifican estado (`POST`, `PUT`, `PATCH`, `DELETE`) se protegen con dos capas
(`CsrfGuard`, global):

1. **Comprobación de `Origin`**: la cabecera debe coincidir exactamente con `FRONTEND_URL`. Bloquea
   envíos cross-site iniciados desde un navegador hacia la API.
2. **Patrón _double submit_**: la cookie `csrf_token` (legible por JavaScript, `SameSite=Lax`,
   `Secure` en producción) debe coincidir con la cabecera `X-CSRF-Token`. Un sitio atacante puede
   provocar que el navegador envíe cookies, pero no puede leer el valor de una cookie de otro
   origen para reproducirlo en la cabecera.

Aquí se añade la segunda capa porque el **refresh token tiene una vida larga (30 días)** y se
presenta automáticamente como cookie. `SameSite=Lax` y la comprobación de origen reducen mucho la
superficie, pero la defensa en profundidad importa: si en algún contexto el navegador adjuntara
credenciales de forma inesperada o una validación de origen resultara insuficiente, el atacante
seguiría sin poder forjar la cabecera con el valor de la cookie. El access token es de corta
duración, pero el vector de sesión persistente es el refresh, y por eso se refuerza también el
resto de mutaciones autenticadas por cookies.

Las peticiones seguras (`GET`, `HEAD`, `OPTIONS`) no modifican estado y quedan fuera de la
comprobación; el guard emite la cookie `csrf_token` si aún no existe para que el cliente pueda
firmar sus mutaciones.

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

## Frontend: reparto de responsabilidades

La web usa el App Router de Next.js y una regla por defecto: **todo es Server Component hasta que
haga falta lo contrario**. El cliente recibe HTML ya renderizado, y solo los fragmentos que de
verdad necesitan estado local, eventos del navegador o datos que cambian sin navegar se convierten
en Client Components. Cada capa tiene una única forma de hablar con la API, para que no convivan
dos maneras de autenticarse o de invalidar datos.

| Necesidad                                                      | Dónde vive                                                        |
| -------------------------------------------------------------- | ----------------------------------------------------------------- |
| Leer datos para pintar una página                              | Server Component → `apiFetch` → `API_INTERNAL_URL`                |
| Mutación de un formulario: una acción, una escritura, recargar | Server Action → `cookies()` + `redirect`; sin caché que invalidar |
| Estado que cambia sin navegar o que comparten varios miembros  | Client Component + TanStack Query (+ Socket.IO)                   |
| Interactividad puramente local (raciones, Wake Lock, editor)   | Client Component con estado de React, sin Query                   |

### Server Components: carga de datos

- **La petición sale del servidor de Next, no del navegador.** `apiFetch` (`src/server/api.ts`,
  marcado con `import 'server-only'` para que un import accidental desde el cliente rompa el
  build) llama a la API por `API_INTERNAL_URL`: `http://backend:3000` dentro de Compose,
  `http://localhost:3000` en desarrollo local. Es una URL de red interna, sin prefijo
  `NEXT_PUBLIC_`, y por tanto nunca llega al bundle del navegador. Al ser tráfico
  servidor→servidor no hay preflight ni CORS de por medio.
- **Se reenvían las cookies de la petición original.** El navegador manda a Next las cookies
  `httpOnly` de la sesión; el Server Component no puede leerlas desde JavaScript, pero sí desde
  `cookies()` de `next/headers`. `apiFetch` copia solo `access_token`, `refresh_token` y
  `csrf_token` a la cabecera `Cookie` de la llamada interna. Filtrar por nombre evita reenviar
  cookies ajenas al dominio de la API y hace explícito qué credenciales viajan. El JavaScript del
  cliente nunca ve los tokens.
- **Los datos de usuario no se cachean.** `apiFetch` usa `cache: 'no-store'`: una respuesta
  autenticada pertenece a una persona y no puede acabar en una caché compartida entre peticiones
  ni entre usuarios. Next 15 ya no cachea `fetch` por defecto, pero la opción se deja explícita
  porque aquí es una regla de seguridad, no un detalle de rendimiento. La memoización de React
  dentro de un mismo render sigue funcionando: dos componentes que piden lo mismo comparten una
  sola llamada.
- **Las rutas con datos de sesión son dinámicas de forma explícita.** Los cuatro Server
  Components que leen el hogar o el usuario —`plan/[weekStart]`, `recipes/[id]`, `pantry` y
  `shopping/[weekStart]`— declaran `export const dynamic = 'force-dynamic'`. No dependen así de
  que `apiFetch` llame a `cookies()` en su middleware para caer en render dinámico: aunque se
  cambiara la configuración de `fetch`, Next no puede servir esas páginas desde una caché
  compartida. El layout raíz también lee `cookies()` para comprobar la sesión.
- **No hay `revalidatePath` ni `revalidateTag`.** Ninguna llamada en `frontend/src`: con
  `force-dynamic` y `cache: 'no-store'` no hay caché de servidor que invalidar. Las mutaciones
  interactivas se actualizan en el navegador con `invalidateQueries` de TanStack Query.
- **`X-Request-Id` viaja de extremo a extremo.** Si la petición entrante ya trae uno, se reutiliza;
  si no, `apiFetch` genera un UUID y lo devuelve junto con la respuesta. Así el id que aparece en
  los logs de Next, en los de la API y en el mensaje de `error.tsx` es el mismo.
- **Un 401 no se resuelve aquí.** Un Server Component no puede escribir cookies, así que no puede
  rotar el refresh token. El refresco transparente ocurre en `middleware.ts`; el componente solo
  ve el resultado: datos o una redirección a login.

#### Refresco de sesión en el middleware

El refresco no puede vivir en `apiFetch`. En React, escribir cookies es una mutación de la
respuesta, y un Server Component solo puede leerlas: si su `fetch` recibe un 401
`TOKEN_EXPIRED`, el `Set-Cookie` del refresh no tiene dónde guardarse. Tampoco vale reintentar
dentro del componente, porque el segundo intento seguiría enviando el access token viejo.
`middleware.ts` corre **antes** del render, sobre la petición, y sí puede reescribir tanto la
petición que ve el Server Component como la respuesta que recibe el navegador.

- **Disparo proactivo.** El middleware decodifica el `exp` del access token (sin verificar la
  firma: eso es trabajo de la API) y renueva cuando caduca en menos de 30 s. Así la API no llega
  a responder 401 y la navegación no pierde el estado de un formulario en curso, cosa que sí
  pasaría con una redirección a login o a una ruta de refresh.
- **Una sola llamada de refresh por petición.** `POST ${API_INTERNAL_URL}/api/auth/refresh`
  lleva `refresh_token` y `csrf_token` en la cabecera `Cookie`, `Origin: FRONTEND_URL` y
  `X-CSRF-Token`, porque el `CsrfGuard` también protege esta mutación. `API_INTERNAL_URL` evita
  el salto por el navegador y el CORS. La petición reenviada y la respuesta llevan
  `X-Middleware-Refreshed: 1`; si Next ejecuta el middleware otra vez para la misma navegación,
  la marca hace que la segunda pasada deje pasar la petición sin volver a refrescar.
- **Se copian las cookies dos veces.** El `Set-Cookie` de la API se escribe en la respuesta al
  navegador y, con los mismos valores, en la cabecera `Cookie` de la petición que continúa al
  render (`NextResponse.next({ request: { headers } })`). La navegación se repite una vez con
  credenciales nuevas, que es el «reintento» visible para el usuario: no hay 401, ni redirect,
  ni parpadeo.
- **Un refresh que no responde 2xx limpia la sesión.** El middleware borra las tres cookies para
  cualquier `!ok`, incluidos 5xx, y deja que el layout redirija a login. Solo la excepción de red
  (fetch sin respuesta) sigue con `NextResponse.next()` sin tocar las cookies. Conviene tenerlo
  presente: un 503 pasajero de la API cierra la sesión.
- **El matcher excluye estáticos, imágenes y `/api`.** Solo se refresca en rutas de la app: todo
  `_next`, el socket, los assets por extensión (imágenes, fuentes, CSS, JS…), `robots.txt`
  y `sitemap.xml`. El rewrite de `/api` y `src/lib/api-client.ts` gestionan sus propios reintentos
  desde el navegador, donde el refresh sí puede seguir el flujo normal. Sin ese recorte, cada
  asset dispararía una llamada al refresh. `frontend/src/middleware.spec.ts` congela la lista.

### Mutaciones: Server Actions y cliente

La intención del proyecto era concentrar los formularios simples en Server Actions, pero **hoy
ese no es el patrón dominante**. Conviene distinguir los tres caminos que conviven:

- **Formularios de autenticación.** `src/app/(auth)/login/page.tsx` y `register/page.tsx` son
  `<form action="/api/auth/login" method="POST">` nativos: el navegador hace el POST al rewrite
  `/api` de Next y la API devuelve las cookies. No pasan por una Server Action ni por `apiFetch`.
  Existe `src/app/(auth)/actions.tsx` con `'use server'` y `loginAction`/`registerAction`, pero
  **no está conectado a esas páginas**: usa una URL relativa desde el servidor, no envía la
  cabecera CSRF y copia `set-cookie` sin atributos. Es código heredado, no el flujo real.
- **Mutaciones desde el navegador con TanStack Query.** Despensa, plan y lista usan
  `src/lib/api-client.ts` con `useMutation`: reintentan una vez tras el refresh y leen
  `csrf_token` para la cabecera `X-CSRF-Token`. Son las que hacen optimismo y reconciliación.
- **Capa de servidor para lecturas.** `apiFetch` también sabe mutar (añade `Origin`,
  `csrf_token` y `X-CSRF-Token`), pero no hay `useActionState`, `revalidatePath` ni
  `revalidateTag` en el frontend: las pantallas vuelven a pedir datos al navegar.

La frontera con el cliente es deliberada: si una interacción necesita respuesta inmediata,
deshacer un cambio o escuchar a otros miembros, no va por una acción de servidor. Unificar los
formularios de autenticación con `apiFetch` + `cookies().set` es deuda pendiente.

### Client Components: partes interactivas en vivo

La lista de la compra es el caso canónico: marcar un ítem mientras otra persona lo desmarca desde
otro móvil. Un Server Component obligaría a una navegación o a una recarga por cada clic y no
podría recibir cambios sin refrescar la página; por eso ese árbol es un Client Component:

- **TanStack Query guarda el estado del servidor en el cliente.** El Server Component de la página
  hace la primera carga con `apiFetch` y le pasa el resultado como `initialData` con su `queryKey`
  (hogar + semana). El primer render ya trae datos, sin una segunda petición desde el navegador ni
  un spinner inicial. `QueryClientProvider` se monta solo en el layout de las rutas interactivas,
  no en el layout raíz, para que el resto de la aplicación siga siendo server-only y no cargue el
  cliente de datos.
- **Marcar es optimista y reversible.** `useMutation` con `onMutate` actualiza la caché al
  instante, guarda el estado anterior y hace rollback en `onError`; al confirmar, `invalidateQueries`
  reconcilia con la respuesta de la API. Es lo que hace que el botón de 48 px responda aunque la
  red tarde, sin mentir si la escritura falla.
- **Socket.IO aplica los eventos sobre la misma caché.** `shopping.item.updated` y
  `shopping.list.regenerated` se traducen en `setQueryData` de la clave del hogar y la semana del
  payload; ningún componente guarda una copia propia. La `version` del evento descarta eventos
  atrasados, y al reconectar se invalidan las consultas para recuperar lo perdido mientras el
  socket estaba caído. La conexión es única y con conteo de referencias (`src/realtime/socket.ts`),
  viaja con `withCredentials` y se autentica por la cookie en el handshake, como se describe en
  «Tiempo real». Los nombres y las cargas de los eventos salen de `packages/contracts`.
- **El navegador llama a la API por el mismo origen.** `src/lib/api-client.ts` usa un _rewrite_ de
  `/api` en `next.config.ts` hacia la API, así que las cookies `httpOnly` viajan solas y no hay
  CORS en el cliente. Solo este cliente añade la cabecera `X-CSRF-Token` leyendo `csrf_token`
  (que no es `httpOnly`) y reintenta una vez tras el refresh. `API_INTERNAL_URL` no aparece aquí.

Que una parte de la interfaz sea interactiva no obliga a moverla entera al cliente: el patrón es
un Client Component pequeño y con una responsabilidad dentro de un árbol que sigue
renderizándose en el servidor. El detalle de receta es el ejemplo claro:

- `src/app/(app)/recipes/[id]/page.tsx` es un **Server Component asíncrono**: hace `await params`,
  llama a `requireHousehold()` y al loader `loadRecipe()` (`src/server/recipe-data.ts`, con
  `import 'server-only'`). No tiene `'use client'` ni datos escritos a mano.
- Su única isla cliente es `cooking-trigger.tsx`: guarda el estado «modo cocina abierto» y carga
  `cooking-mode.tsx` con `next/dynamic` solo cuando se pulsa el botón. Recibe del servidor únicamente
  `title` y `steps`, datos serializables.
- `socket.io-client` no entra en esa ruta. El analyzer confirma que su chunk (41.430 B parsed /
  12.720 B gzip) es inicial **solo** para `/shopping/[weekStart]`; `e2e/tests/realtime-boundary.spec.ts`
  comprueba que detalle y editor no abren WebSocket y la lista sí.
- Las herramientas de medición son `@next/bundle-analyzer` (`npm run analyze -w frontend`) y
  Lighthouse (`npm run measure:lighthouse -w e2e`). El JS del detalle bajó de 5.135 B a 3.912 B
  parsed; las cuatro categorías de Lighthouse se mantuvieron en 100.

## Límites conocidos

Lo que sigue está pendiente o es una simplificación deliberada, no una decisión de diseño
cerrada. El detalle y la priorización están en `MEJORAS.md`.

| Límite                | Situación real                                                                                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Importación en la web | `src/app/(app)/recipes/[id]/import-dialog.tsx` es un placeholder («disponible próximamente»). La API, el worker y los eventos `import.finished`/`import.failed` sí funcionan; falta enganchar el diálogo. |
| Editor de recetas     | `recipes/[id]/editor/page.tsx` muestra «Editor de recetas disponible próximamente», aunque la API expone `PUT` y `PATCH`.                                                                                 |
| Listado de recetas    | `recipes/page.tsx` usa `fetch` crudo con una «Simulación de estructura de respuesta», un `householdId` por defecto `'current'` y una imagen `minio.example.com` que no existe en el contrato.             |
| Selector de hogar     | `src/app/(auth)/header.tsx` solo muestra un badge. `requireHousehold()` toma el primer hogar del usuario y conviven dos árboles de ruta de compra: `(app)/shopping` y `(app)/[householdId]/shopping`.     |
| Sesión                | Gracia de 10 s para refresh concurrente; _single-flight_ solo por pestaña; access token no revocable antes de 15 min; un 5xx del refresh cierra la sesión.                                                |
| `version` de la lista | Se emite en los eventos pero no se incrementa al marcar ítems. La atomicidad la da Mongo, no el control optimista.                                                                                        |
| N+1 de recetas        | La generación de la lista y el loader del plan piden las recetas de una en una; no hay `$in` ni `$lookup`.                                                                                                |
| Contrato OpenAPI      | Varios cuerpos `200` no tienen `schema` y los tipos se escriben a mano (`src/lib/api-result.ts`, `src/server/recipe-data.ts`).                                                                            |
| Semanas               | `weekStart` se guarda como lunes a 00:00 **UTC**; la semana actual se calcula con la zona IANA del hogar (`timeZone`), que se migra a `UTC` en los hogares antiguos.                                      |
| Medios                | Sin limpieza de subidas no confirmadas ni `jobId` determinista al encolar.                                                                                                                                |
| Arranque              | Quedan restos de `create-next-app` en `frontend/src/app/page.tsx`.                                                                                                                                        |

Además de estas deudas, la sección «Mutaciones: Server Actions y cliente» señala otros puntos
donde el código aún no sigue el reparto descrito más arriba.

## Reglas del workspace

- Un único `package-lock.json` en la raíz; los workspaces (`backend`, `frontend`, `e2e`,
  `packages/*`) no tienen lockfile propio.
- Los paquetes compartidos se compilan antes que sus consumidores: `npm run build` en la raíz
  recorre los workspaces en orden.
