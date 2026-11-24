# Revisión de arquitectura — Fase 0

- **Rama:** `docs/architecture-review`
- **Base:** `main` @ `85e49d4` (sincronizada con `origin/main`, sin cambios pendientes)
- **Fecha:** 24 de noviembre de 2026
- **Alcance:** todo el repositorio (`backend/`, `frontend/`, `e2e/`, `packages/contracts/`, `infra/`, `.github/`, Dockerfiles y Compose)
- **Método:** lectura del código y `grep` dirigido; no se modificó código de aplicación.

> Criterio de estado: **Confirmado** = el riesgo/hallazgo se materializa en el código actual;
> **Parcial** = existe mitigación, pero queda un caso real sin cubrir; **Descartado** = el código
> ya no presenta el problema. La columna «Fase» remite a las fases de `MEJORAS.md`.

## Resumen

| Grupo            |                Confirmado |    Parcial |                       Descartado |
| ---------------- | ------------------------: | ---------: | -------------------------------: |
| Riesgos R1–R14   | 5 (R5, R9, R12, R13, R14) | 2 (R3, R8) | 7 (R1, R2, R4, R6, R7, R10, R11) |
| Hallazgos H1–H10 |            3 (H1, H6, H9) | 2 (H5, H7) |          5 (H2, H3, H4, H8, H10) |
| Nuevos H11–H18   |                         8 |          — |                                — |

Conclusión corta: el repositorio ya resolvió los riesgos de composición de Nest, aislamiento por
hogar, caché del servidor de Next, socket en layouts y duplicación de unidades. Lo que sigue vivo
es la rotación concurrente de refresh (H1), la serialización de documentos crudos (H5), los restos
de medios/colas (H6, H7), la semana en UTC (H9) y la deuda de CI/Docker (R12–R14). Además aparecen
ocho hallazgos nuevos, el más grave de ellos el throttling que nunca se registra (H11).

---

## 1. Riesgos R1–R14

| #   | Riesgo                                               | Estado         | Evidencia (archivo:línea)                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ---------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Módulos con `forwardRef`                             | **Descartado** | No hay ninguna coincidencia de `forwardRef` en `backend/src/**/*.module.ts`; la composición es directa en `backend/src/app.module.ts:38-88`.                                                                                                                                                                                                                                                                                                                      |
| R2  | `Model` de Mongoose fuera de repositorios            | **Descartado** | `grep InjectModel` fuera de `*.repository.ts` devuelve 0 coincidencias. Todos los repositorios filtran por hogar: `backend/src/recipes/recipes.repository.ts:45-48,58-59`, `backend/src/meal-plans/meal-plans.repository.ts:6-10,16-17`, `backend/src/pantry/pantry.repository.ts:18-22,28-29`, `backend/src/shopping/shopping-lists.repository.ts:17-22,30-31`.                                                                                                  |
| R3  | Documentos Mongoose serializados tal cual            | **Parcial**    | Hay `lean()` y mapeos explícitos en recetas/hogares (`backend/src/recipes/recipes.service.ts:20`, `backend/src/households/households.service.ts:199`), pero plan, despensa y lista devuelven el documento crudo: `backend/src/meal-plans/meal-plans.controller.ts:17-19,29-31`, `backend/src/pantry/pantry.controller.ts:26-29`, `backend/src/shopping/shopping-lists.controller.ts:32-36,48-58`. Ver H5.                                                         |
| R4  | `new Date()` disperso                                | **Descartado** | El reloj es inyectable (`backend/src/auth/auth.clock.ts:1-10`) y auth lo usa (`backend/src/auth/auth.service.ts:57,76,128,135`, `backend/src/auth/auth-tokens.service.ts:94`). Los `new Date()` restantes son de seed/importación o el valor por defecto paramétrico de `startOfWeek` (`backend/src/seed/seed.service.ts:105-115`, `backend/src/imports/imports.processor.ts:79`, `backend/src/common/week.ts:38`).                                               |
| R5  | Refresh concurrente interpretado como reutilización  | **Confirmado** | `backend/src/auth/auth.service.ts:224-245`: si el token presentado ya tiene `usedAt`, se revoca la familia sin ventana de gracia. La escritura atómica que lo provoca está en `backend/src/auth/refresh-sessions.repository.ts:47-65`. Ver H1.                                                                                                                                                                                                                    |
| R6  | Middleware de Next refrescando de más                | **Descartado** | Solo intenta refrescar si el access token está a ≤30 s de caducar (`frontend/src/middleware.ts:50-59,170-176`) y el `matcher` excluye `api`, `socket.io`, `_next/static`, `_next/image`, `favicon` y assets (`frontend/src/middleware.ts:243-251`). Ver H2.                                                                                                                                                                                                       |
| R7  | `fetch` del servidor de Next cacheado entre usuarios | **Descartado** | El cliente usa `cache: 'no-store'` (`frontend/src/server/api.ts:77-84`), lee cookies por petición (`frontend/src/server/api.ts:44-75`) y no hay `revalidate`/`force-static` en `frontend/src`. Ver H3.                                                                                                                                                                                                                                                            |
| R8  | Trabajos BullMQ no idempotentes o sin limpieza       | **Parcial**    | La limpieza existe (`backend/src/imports/imports.queue.ts:15-23`, `backend/src/media/media.service.ts:38-44`) y la importación deduplica por `jobId` (`backend/src/imports/imports.service.ts:45-60`), pero el procesador de importación no es idempotente entre reintentos (`backend/src/imports/imports.processor.ts:64-82`) y los trabajos de medios no llevan `jobId` (`backend/src/media/media.service.ts:178-180,195-201`). Ver H7.                         |
| R9  | Objetos huérfanos en MinIO                           | **Confirmado** | La URL prefirmada crea una clave que no se registra en Mongo (`backend/src/media/media.service.ts:72-89`); el borrado solo cubre claves de una receta existente (`backend/src/media/media.processor.ts:94-120`). No hay `ListObjects`, ciclo de vida ni barrido periódico (`grep` sin coincidencias). Ver H6.                                                                                                                                                     |
| R10 | Lógica de unidades duplicada                         | **Descartado** | El catálogo y el factor viven en `packages/contracts/src/units.ts:20-32`; el backend normaliza desde ahí (`backend/src/common/units.ts:1,45-53`) y el frontend solo consume `UNITS_LIST` (`frontend/src/app/(app)/pantry/pantry-board.tsx:4,228`). Ver H8.                                                                                                                                                                                                        |
| R11 | Socket.IO en layouts globales                        | **Descartado** | Solo lo monta el componente de la lista (`frontend/src/app/(app)/shopping/[weekStart]/shopping-list.tsx:16,59` → `frontend/src/realtime/use-shopping-list.ts:85`). Los layouts de plan, despensa y compra no importan socket (`frontend/src/app/(app)/plan/layout.tsx:1`, `frontend/src/app/(app)/pantry/layout.tsx:1`, `frontend/src/app/(app)/shopping/layout.tsx:1`).                                                                                          |
| R12 | Una app de Nest por archivo de test                  | **Confirmado** | 15 archivos `backend/test/*.e2e-spec.ts` crean su propia app; p. ej. `backend/test/auth.e2e-spec.ts:74-84`, `backend/test/recipes.e2e-spec.ts:114-127`, `backend/test/media.e2e-spec.ts:77-87`. Solo `health.e2e-spec.ts:23` y `shutdown.e2e-spec.ts:8` usan `backend/test/support/test-app.ts:8-16`.                                                                                                                                                             |
| R13 | CI sin caché de Next/Playwright y jobs duplicados    | **Confirmado** | `.github/workflows/ci.yml:19-217`: seis jobs repiten `npm ci` (líneas 35, 64, 84, 118, 148, 169); `build` compila todo (línea 66) y `backend-test`/`frontend-test` vuelven a compilar (líneas 95-96, 126-127); no hay caché de `.next/cache` ni de navegadores Playwright (instalación en líneas 171-172).                                                                                                                                                        |
| R14 | Imágenes base y acciones sin fijar                   | **Confirmado** | `backend/Dockerfile:4` y `frontend/Dockerfile:3` usan `node:22-alpine`; `backend/Dockerfile.prod:9` y `frontend/Dockerfile.prod:7` usan `node:22-alpine` por defecto; Compose usa `caddy:2-alpine`, `mongo:7`, `redis:7-alpine`, `bitnamilegacy/minio:latest`, `axllent/mailpit` y `nginx:alpine` (`docker-compose.prod.yml:47,70,88,121,144,187`, `docker-compose.e2e.yml:127`). Las acciones están en `@v4`, no por SHA (`.github/workflows/ci.yml:26,29,182`). |

### Notas de los riesgos confirmados o parciales

- **R3/H5.** La API no filtra `passwordHash` (está `select: false` en
  `backend/src/users/user.schema.ts:16-17` y auth mapea a mano en
  `backend/src/auth/auth.service.ts:146-152,167-176`). El problema es otro: plan, despensa y lista
  serializan el documento `lean` completo, con `_id`, `householdId`, `createdAt`, `updatedAt` y
  `__v` (o `version` en la lista). El frontend ya lo asume (`frontend/src/lib/meal-plan.ts:36-43`,
  `frontend/src/lib/shopping.ts:26-33`), así que es parte del contrato de facto.
- **R8/H7.** La limpieza de BullMQ está bien configurada; lo que falta es idempotencia real del
  procesador de importación y un `jobId` determinista en medios. Ver H15 y H16.
- **R9/H6.** El caso concreto es una URL prefirmada usada por el navegador pero nunca confirmada
  con `POST …/image/confirm`: el objeto queda en el bucket sin receta que lo referencie.

---

## 2. Hallazgos H1–H10

| #   | Hallazgo                                                   | Estado         | Evidencia (archivo:línea)                                                                                                                                                                                                                                                                                                                                                                                                                                     | Fase           |
| --- | ---------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| H1  | Refresh simultáneo de dos pestañas revoca la familia       | **Confirmado** | `backend/src/auth/auth.service.ts:224-245` revoca al ver `usedAt`; `backend/src/auth/refresh-sessions.repository.ts:47-65` hace el canje atómico. No existe `GRACE_MS` ni `reissueSuccessor` (`grep` sin coincidencias).                                                                                                                                                                                                                                      | 1              |
| H2  | Middleware de Next refrescando de más                      | **Descartado** | `frontend/src/middleware.ts:50-59,170-176` refresca solo cerca de la caducidad; `frontend/src/middleware.ts:243-251` excluye estáticos, API y socket.                                                                                                                                                                                                                                                                                                         | 1 (sin acción) |
| H3  | `fetch` del servidor de Next cacheado entre usuarios       | **Descartado** | `frontend/src/server/api.ts:77-84` fija `cache: 'no-store'`; `frontend/src/server/api.ts:44-75` reenvía cookies de la petición; no hay `revalidate` en `frontend/src`.                                                                                                                                                                                                                                                                                        | 2 (sin acción) |
| H4  | Acceso a `Model` fuera de repositorios sin filtro de hogar | **Descartado** | 0 `InjectModel` fuera de `*.repository.ts`; filtros por hogar en `backend/src/recipes/recipes.repository.ts:58-59,66-67,86,118,165,174`, `backend/src/pantry/pantry.repository.ts:29,38,48`, `backend/src/shopping/shopping-lists.repository.ts:31,47,72`.                                                                                                                                                                                                    | 3 (sin acción) |
| H5  | Documentos Mongoose serializados tal cual                  | **Parcial**    | `backend/src/meal-plans/meal-plans.controller.ts:17-19,29-31` y `backend/src/pantry/pantry.controller.ts:26-29` devuelven el tipo de esquema; `backend/src/shopping/shopping-lists.controller.ts:32-36` devuelve `ShoppingList`. Esquemas con `versionKey` por defecto: `backend/src/meal-plans/meal-plan.schema.ts:45-65`, `backend/src/pantry/pantry-item.schema.ts:5-26`; `version` explícito: `backend/src/shopping/shopping-list.schema.ts:45-52,67-70`. | 3              |
| H6  | Objetos huérfanos en MinIO                                 | **Confirmado** | `backend/src/media/media.service.ts:72-89` crea la clave sin registro; `backend/src/media/media.processor.ts:94-120` solo borra claves conocidas; no hay barrido (`backend/src/worker.ts:11-16` no registra trabajo repetible; `grep listObjects/lifecycle` sin coincidencias).                                                                                                                                                                               | 4              |
| H7  | Trabajos BullMQ no idempotentes y sin limpieza             | **Parcial**    | Limpieza: `backend/src/imports/imports.queue.ts:15-23`, `backend/src/media/media.service.ts:38-44`. Idempotencia incompleta: `backend/src/imports/imports.processor.ts:64-82` crea la receta antes de `markCompleted`; reintento → otra receta. Medios sin `jobId`: `backend/src/media/media.service.ts:178-180,195-201`.                                                                                                                                     | 4              |
| H8  | Unidades calculadas distinto en back y front               | **Descartado** | Catálogo único en `packages/contracts/src/units.ts:20-32`; normalización solo en backend (`backend/src/common/units.ts:45-53`); el frontend no convierte, solo lista unidades (`frontend/src/app/(app)/pantry/pantry-board.tsx:4,228`).                                                                                                                                                                                                                       | 5 (sin acción) |
| H9  | `weekStart` calculado en UTC                               | **Confirmado** | `backend/src/common/week.ts:32-45` y `frontend/src/lib/week.ts:12-25` calculan el lunes con `getUTC*`. No hay zona horaria en el hogar (`grep timezone` sin coincidencias en `backend/src`, `frontend/src` ni `packages/contracts/src`). En UTC−5 el lunes empieza el domingo a las 19:00 local.                                                                                                                                                              | 5              |
| H10 | `SafeHttpClient` no revalida la IP en cada redirección     | **Descartado** | `backend/src/imports/safe-http.client.ts:271-310` llama a `resolve(current)` en cada iteración del bucle, incluida cada `Location`; `backend/src/imports/safe-http.client.ts:382-415` valida todas las IPs resueltas y conecta a una ya validada.                                                                                                                                                                                                             | 0 (cerrado)    |

### Notas de los hallazgos con matiz

- **H1.** El problema es exactamente el descrito en el plan: dos pestañas presentan el mismo
  refresh; la primera canjea y la segunda entra en `classifyFailedClaim`, ve `usedAt` y revoca la
  familia. La transacción evita corrupción, no el cierre espurio.
- **H5.** `passwordHash` no se filtra, pero `__v`/`version`, `_id`, `householdId` y timestamps sí
  salen en plan, despensa y lista. El contrato OpenAPI no los describe (ver H17), así que el
  frontend los tipa a mano.
- **H7.** La importación es idempotente **al encolar** (índice único por `jobId`), no **al
  procesar**. Si falla `markCompleted` o la escritura de la receta, el reintento crea otra receta.
- **H9.** Es una decisión consciente y documentada, pero el efecto existe: para un hogar en UTC−5
  la semana cambia el domingo a las 19:00. La corrección del plan (zona del hogar) sigue vigente.

---

## 3. Hallazgos nuevos H11–H18

| #   | Hallazgo                                                                         | Severidad | Evidencia (archivo:línea)                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Fase                                   |
| --- | -------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| H11 | El throttling no está activo: `ThrottlerModule` nunca se importa                 | Alta      | `backend/src/main.ts:6,92-101` llama a `ThrottlerModule.forRoot()` y descarta el resultado; `backend/src/app.module.ts:38-88` no lo importa y `:80-87` no registra `ThrottlerGuard`; no hay `@Throttle` en `backend/src`. La dependencia sí está en `backend/package.json:49`.                                                                                                                                                                                                                        | 9 (y 17 para almacenamiento Redis)     |
| H12 | Validación de entrada incompleta: DTOs inline y `itemId` sin `ParseObjectIdPipe` | Media     | `backend/src/meal-plans/meal-plans.controller.ts:28`, `backend/src/shopping/shopping-lists.controller.ts:52-56,85-92` y `backend/src/pantry/pantry.controller.ts:39` usan tipos inline, que el `ValidationPipe` global no valida (`backend/src/common/pipes/validation.pipe.ts:18-31`). `backend/src/shopping/shopping-lists.controller.ts:51,74` convierte `itemId` con `new Types.ObjectId(...)` sin pipe: un id inválido produce 500.                                                              | 3                                      |
| H13 | `weekStart` no se valida en actualizar plan, generar lista ni editar ítems       | Media     | Solo `getPlan` valida (`backend/src/meal-plans/meal-plans.service.ts:21-24`); `updateSlots` no (`:35-49`). La lista convierte la fecha sin validar (`backend/src/shopping/shopping-lists.controller.ts:36,73,94`) y el servicio tampoco comprueba (`backend/src/shopping/shopping-lists.service.ts:72`). El validador existe en `backend/src/common/week.ts:6-14` y solo se usa en los esquemas (`backend/src/meal-plans/meal-plan.schema.ts:57`, `backend/src/shopping/shopping-list.schema.ts:61`). | 5                                      |
| H14 | El cliente puede fijar `checkedBy` al añadir un ítem manual                      | Baja      | `backend/src/shopping/shopping-lists.controller.ts:85-101`: `checkedBy` llega del cuerpo (`:91`) y se convierte en `ObjectId` (`:100`). Contradice la regla de autoría de `updateItem`, que usa el usuario de la sesión (`:67-69`).                                                                                                                                                                                                                                                                   | 3                                      |
| H15 | El procesador de importación duplica recetas en un reintento                     | Media     | `backend/src/imports/imports.processor.ts:47,64-82` crea la receta y después marca completado; el `catch` marca fallido y relanza (`:88-105`), y el reintento vuelve a crear otra receta. La deduplicación de `backend/src/imports/imports.repository.ts:32-60` solo cubre la creación del registro, no el efecto lateral.                                                                                                                                                                            | 4                                      |
| H16 | Trabajos de medios sin `jobId` y carrera entre confirmar y borrar                | Media     | `backend/src/media/media.service.ts:178-180,195-201` encola sin `jobId`; dos confirmaciones generan trabajos duplicados (las claves son deterministas, así que el resultado se sobrescribe, pero se paga el trabajo). Además, `backend/src/recipes/recipes.service.ts:192` encola miniaturas y `:265` encola el borrado: si la miniatura ya leyó el original y el borrado se ejecuta antes de sus escrituras, vuelve a crear variantes huérfanas.                                                     | 4                                      |
| H17 | OpenAPI no describe cuerpos ni respuestas                                        | Media     | `packages/contracts/openapi.json` tiene 25 rutas pero ninguna referencia a esquemas de respuesta; `components.schemas` solo contiene DTOs de entrada vacíos. El frontend lo suple con tipos a mano (`frontend/src/lib/meal-plan.ts:1-6`, `frontend/src/lib/shopping.ts:26-33`) y el test de contrato solo verifica título/versión/servidores (`backend/test/openapi.contract.spec.ts:29-39`).                                                                                                         | 3 (respuestas) y 6 (congelar contrato) |
| H18 | Layout huérfano de compra bajo `[householdId]`                                   | Baja      | `frontend/src/app/(app)/[householdId]/shopping/layout.tsx:10-12` existe sin ningún `page.tsx` bajo ese segmento; la ruta real es `frontend/src/app/(app)/shopping/[weekStart]/page.tsx:15-28`.                                                                                                                                                                                                                                                                                                        | 7                                      |

### Detalle de los hallazgos nuevos

#### H11 — Throttling inactivo

`main.ts` importa `ThrottlerModule` y ejecuta `ThrottlerModule.forRoot()` como una expresión suelta
dentro de `bootstrap()`; el módulo resultante no se importa en `AppModule` ni se registra un
`ThrottlerGuard`. No hay ningún `@Throttle` en el backend. El efecto es que login, refresh,
importaciones y escrituras no tienen límite de tasa pese a que el código y los comentarios lo
sugieren. Es el hallazgo de mayor impacto de esta revisión.

#### H12 — La validación global no alcanza a los cuerpos inline

El `ValidationPipe` global (`APP_PIPE` en `backend/src/app.module.ts:84`) solo valida clases con
decoradores de `class-validator`. Los controladores de plan, lista y despensa declaran el cuerpo
como tipo literal, así que `whitelist`/`forbidNonWhitelisted` no hacen nada y los valores llegan
al servicio sin comprobar. En la lista, `itemId` tampoco pasa por `ParseObjectIdPipe`; un
identificador malformado lanza `BSONError` y el filtro global lo convierte en 500.

#### H13 — `weekStart` inconsistente entre lectura y escritura

`getPlan` valida que sea lunes a las 00:00 UTC, pero `updateSlots`, `generate`, `updateItem` y
`addManualItem` hacen `new Date(weekStart)` sin comprobarlo. Un martes, una fecha inexistente o un
texto arbitrario acaban en una consulta con `Invalid Date` o en un `ValidationError` del esquema,
que el cliente ve como 500 en lugar de 400.

#### H14 — Autoría de `checkedBy` falseable

En `updateItem`, `checkedBy` sale siempre de `@CurrentUser()`; en `addManualItem`, en cambio, se
acepta del cuerpo. Cualquier miembro puede crear un ítem ya marcado a nombre de otro. Es de baja
severidad (mismo hogar), pero rompe la regla de autoría que el propio controlador documenta.

#### H15 — Importación no idempotente en el procesador

El `jobId` determinista y el índice único evitan dos trabajos para la misma URL, pero no evitan que
un reintento del mismo trabajo cree otra receta: la receta se crea antes de `markCompleted` y no
hay un `recipeId` previo que reutilizar. Un fallo transitorio entre ambas escrituras deja dos
recetas para una sola importación.

#### H16 — Medios: `jobId` ausente y orden confirmar/borrar

Las miniaturas son idempotentes por construcción (claves deterministas), pero no llevan `jobId`,
así que dos confirmaciones encolan dos trabajos idénticos. La carrera real es confirmar una imagen
y borrar la receta poco después: si la miniatura ya descargó el original y el borrado se ejecuta
antes de que escriba las variantes, vuelve a crearlas y deja objetos sin receta. Si el borrado
llega antes de la descarga, la miniatura falla y se reintenta sin recrear nada.

#### H17 — El contrato OpenAPI no cubre respuestas

Las 25 rutas exportadas no declaran esquema de respuesta y los DTOs de `components.schemas` están
vacíos. El frontend compensa con interfaces manuales que ya incluyen `_id`, `householdId` y
`version` (síntoma de H5). El test de contrato no detectaría una divergencia de forma.

#### H18 — Layout sin ruta

`(app)/[householdId]/shopping/layout.tsx` monta `QueryProvider` para un segmento que no tiene
página. No rompe nada, pero confunde la estructura de rutas y sugiere un refactor a medias.

---

## 4. Impacto en el plan

- **Fase 0:** H10 queda cerrado (el cliente ya valida cada redirección). No hay que asignarle fase.
- **Fase 2:** H3 descartado; la fase queda como refuerzo de tests, no como corrección.
- **Fase 3:** mantiene H5 y suma H12, H14 y la parte de respuestas de H17.
- **Fase 4:** mantiene H6/H7 y suma H15/H16 (idempotencia del procesador de importación y `jobId`
  de medios).
- **Fase 5:** mantiene H9 y suma H13 (validación de `weekStart` en escrituras). H8 descartado.
- **Fase 9:** H11 debe entrar aquí (registrar `ThrottlerModule` y `ThrottlerGuard`); la Fase 17 lo
  verifica con almacenamiento Redis y dos réplicas.
- **Fase 16/17:** R14 se reparte como ya prevé el plan: acciones por SHA en Fase 16 e imágenes por
  digest en Fase 17.
- **Fase 7:** H18 entra en la limpieza de restos.

## 5. Comandos de verificación usados

```bash
rg -n "forwardRef" backend/src --glob '*.module.ts'
rg -n "InjectModel" backend/src | rg -v "repository.ts"
rg -n "\.lean<" backend/src
rg -n "new Date\(\)|Date\.now\(\)" backend/src | rg -v spec
rg -n "no-store|force-dynamic|revalidate|cache:" frontend/src
rg -n "listObjects|lifecycle|orphan|sweep|cleanup" backend/src
rg -n "Throttler|@Throttle|APP_GUARD" backend/src
rg -n "checkedBy|new Types\.ObjectId" backend/src/shopping
```
