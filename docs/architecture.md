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
