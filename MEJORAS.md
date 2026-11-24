# MEJORAS.md — Plan de mejora de calidad, escalabilidad y mantenibilidad (Recipe Planner)

Este plan se ejecuta **después** de terminar `INSTRUCCIONES.md`, con la app completa en `main`.

1. **Diagnóstico**: riesgos típicos de NestJS + MongoDB + BullMQ + Socket.IO + Next.js App
   Router tras una primera construcción, y la arquitectura objetivo.
2. **Plan de prompts**: fases con rama propia que terminan en una PR.

> El diagnóstico se escribe antes de ver el código. La **Fase 0** revisa el repositorio real y
> marca cada hallazgo del Apéndice como *confirmado* o *descartado* con evidencia. Cada
> corrección del Bloque A empieza con un test que falla; si no falla, se descarta y se anota.

## Reglas para ejecutar el plan

- **Bloque A (Fases 1–5) cambia el comportamiento a propósito.** Si cambia el contrato, se
  regeneran `packages/contracts/openapi.json` y los tipos del frontend en el mismo prompt.
- **Bloque B (Fases 6–18) no cambia la funcionalidad**: rutas, status, cuerpos JSON, cookies,
  eventos de Socket.IO y UI quedan idénticos. La Fase 6 los congela con tests.
- Después de cada prompt: `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run test:integration` y `npm run build` en todos los workspaces; si toca UI o HTTP,
  también la e2e.
- **⚠️ dependencia** = paquete o herramienta nueva: consúltalo antes.
- "Apruébala" significa CI en verde.

---

# Parte 1 — Diagnóstico

## 1. Arquitectura esperada

```
Navegador ──► Caddy (prod) / next dev (:3001)
                │ /api/*       → NestJS (Fastify)
                │ /socket.io   → RealtimeGateway (adaptador Redis)
                │ /media       → MinIO (URLs prefirmadas)
                │ resto        → Next.js (RSC + Server Actions)
Next.js (servidor) ──► API por la red interna (reenvía cookies; middleware refresca)
NestJS ──► Mongoose ──► MongoDB (replica set)
       ──► BullMQ ──► worker (thumbnails, imports, borrados) ──► MinIO / Mongo / Redis emitter
```

## 2. Riesgos anticipados de este stack

| # | Riesgo | Dónde mirar | Por qué es un problema |
| --- | --- | --- | --- |
| R1 | Módulos de Nest con dependencias circulares resueltas con `forwardRef` | `*.module.ts` | Acoplamiento oculto; orden de arranque frágil |
| R2 | Servicios que usan `Model` de Mongoose directamente, saltándose el repositorio | servicios | Consultas sin filtro de `householdId` |
| R3 | Documentos de Mongoose (no `lean`) devueltos por la API | controladores | Campos internos (`__v`, `passwordHash`) que se filtran; serialización lenta |
| R4 | `new Date()` disperso | auth, planes, colas | Rotación de tokens y semanas no deterministas en tests |
| R5 | Refresh concurrente desde varias pestañas que se interpreta como reutilización | auth + middleware | Cierres de sesión espurios |
| R6 | Middleware de Next que refresca en cada petición o en rutas estáticas | `middleware.ts` | Llamadas de más a la API y latencia |
| R7 | `fetch` del servidor de Next cacheado entre usuarios | `src/server/api.ts` | Fuga de datos entre usuarios |
| R8 | Trabajos de BullMQ no idempotentes o sin limpieza (`removeOnComplete`) | worker | Redis creciente; miniaturas duplicadas |
| R9 | Objetos huérfanos en MinIO (subidas no confirmadas) | media | Coste y datos sin dueño |
| R10 | Lógica de unidades duplicada en el backend y el frontend | `units.ts` | Cantidades distintas al escalar |
| R11 | Socket.IO conectado en layouts globales | frontend | Conexiones abiertas en páginas que no lo necesitan |
| R12 | Tests de integración con una app de Nest por archivo | `test/` | Suite lenta |
| R13 | CI sin caché de Next (`.next/cache`) ni de Playwright, jobs duplicados | `ci.yml` | Minutos desperdiciados |
| R14 | Imágenes base y acciones sin fijar | Dockerfiles, `ci.yml` | Builds no reproducibles |

## 3. Arquitectura objetivo

```
packages/contracts/   # eventos, códigos de error, unidades (+ tabla de casos), openapi.json, tipos generados
backend/src/
├── main.ts           # bootstrap mínimo
├── app.module.ts     # composición; sin forwardRef
├── common/           # filtros, pipes, clock, request-context (AsyncLocalStorage)
├── <módulo>/         # controller · service · repository · dto · schema · <módulo>.module.ts
└── worker.ts         # solo procesadores; reutiliza los módulos de dominio
frontend/src/
├── server/           # api.ts, session.ts (server-only)
├── features/<módulo>/
└── realtime/         # socket.ts solo importado por las rutas que lo usan
```

## 4. Código de referencia

**Ventana de gracia para refresh concurrentes** (Fase 1):

```ts
// Si el token presentado se usó hace < 10 s, devuelve el sucesor ya emitido en lugar de revocar la familia.
if (session.usedAt && now - session.usedAt.getTime() < GRACE_MS) {
  return this.reissueSuccessor(session);
}
```

**Contexto de petición sin pasarlo por parámetros** (Fase 9):

```ts
export const requestContext = new AsyncLocalStorage<{ requestId: string; userId?: string }>();
```

---

# Parte 2 — Plan de prompts

## Fase 0 — Revisión de arquitectura

1- Crea una rama `docs/architecture-review` a partir de `main` actualizada para las siguientes acciones.

2- Revisa todo el repositorio y contrasta cada riesgo R1–R14 y cada hallazgo H1–H10 del Apéndice con el código. Escribe el estado, la evidencia (archivo y línea) y los hallazgos nuevos (H11…) con su fase. No cambies código. Haz commit y push.

3- Crea una PR, apruébala y haz merge en la rama main.

---

# Bloque A — Corrección de hallazgos

## Fase 1 — Refresh concurrente sin cierres espurios (H1, H2)

4- Crea una rama `fix/concurrent-refresh` para las siguientes acciones.

5- Escribe primero el test: dos pestañas refrescan a la vez con el mismo refresh token; hoy una revoca la familia. Comprueba que falla. Haz commit y push.

6- Añade una ventana de gracia de 10 s en la que un token recién usado devuelve el sucesor ya emitido en lugar de revocar, y deja intacta la detección de reutilización fuera de esa ventana (test). Documéntalo como ADR. Haz commit y push.

7- Haz que el middleware de Next solo intente refrescar en rutas de la app (`matcher` que excluye `_next`, estáticos e imágenes) y una sola vez por petición, con un test. Haz commit y push.

8- Crea una PR, apruébala y haz merge en la rama main.

## Fase 2 — Aislamiento entre usuarios en el servidor de Next (H3)

9- Crea una rama `fix/next-server-isolation` para las siguientes acciones.

10- Escribe primero un test (o un e2e con dos contextos) que cargue la misma página con dos usuarios distintos en paralelo y compruebe que ninguno ve datos del otro, y un test que falle si alguna llamada de `apiFetch` no lleva `cache: 'no-store'` o `revalidate: 0`. Haz commit y push.

11- Marca las rutas con datos de usuario como dinámicas (`export const dynamic = 'force-dynamic'` o el uso de `cookies()`), revisa `revalidatePath`/`revalidateTag` y documenta la regla. Haz commit y push.

12- Crea una PR, apruébala y haz merge en la rama main.

## Fase 3 — Repositorios como única puerta a Mongo (H4, H5)

13- Crea una rama `fix/repository-boundary` para las siguientes acciones.

14- Escribe un test por recurso que intente leer o modificar un documento de otro hogar a través de cada endpoint y servicio. Comprueba si alguno falla. Haz commit y push.

15- Sustituye cualquier uso de `Model` fuera de los repositorios y añade una regla de ESLint (`no-restricted-imports` de `@nestjs/mongoose`/`InjectModel` fuera de `*.repository.ts`). Haz commit y push.

16- Haz que todas las lecturas usen `lean()` y que la salida pase por DTOs de respuesta explícitos (`plainToInstance` con `excludeExtraneousValues`), con un test que falle si aparece `__v` o `passwordHash`. Haz commit y push.

17- Crea una PR, apruébala y haz merge en la rama main.

## Fase 4 — Medios y colas sin restos (H6, H7)

18- Crea una rama `fix/media-and-queue-cleanup` para las siguientes acciones.

19- Escribe primero el test: una URL prefirmada usada pero nunca confirmada deja un objeto huérfano. Añade un trabajo repetible de BullMQ que borre los objetos sin receta de más de 24 h (lista paginada por prefijo) y una regla de ciclo de vida de MinIO como red de seguridad. Haz commit y push.

20- Haz idempotentes los trabajos (`jobId` determinista para las miniaturas por clave de imagen) y configura `removeOnComplete`/`removeOnFail` con límites. Test que encole dos veces y compruebe un solo resultado. Haz commit y push.

21- Crea una PR, apruébala y haz merge en la rama main.

## Fase 5 — Unidades y semanas coherentes (H8, H9)

22- Crea una rama `fix/units-and-weeks` para las siguientes acciones.

23- Crea `packages/contracts/units-cases.json` con 40 casos de normalización, suma y escalado, y haz que lo consuman los tests del backend y del frontend. Mueve la lógica de unidades a `contracts` si está duplicada. Haz commit y push.

24- Escribe tests del cálculo de `weekStart` en una zona positiva y otra negativa (domingo por la noche) y corrige para que la semana se calcule con la zona del hogar (añádela al hogar si no existe, con migración de datos). Haz commit y push.

25- Crea una PR, apruébala y haz merge en la rama main.

---

# Bloque B — Refactor sin cambio de comportamiento

## Fase 6 — Red de seguridad: tests de caracterización

26- Crea una rama `test/characterization-baseline` para las siguientes acciones.

27- Añade *snapshot tests* del JSON exacto de cada endpoint, éxito y cada error del sobre. Haz commit y push.

28- Fija los nombres y *payloads* de los eventos de Socket.IO, los atributos de las tres cookies y los códigos de error de auth. Haz commit y push.

29- Fija `ShoppingListGenerator` y el parser de ingredientes con tablas de casos. Haz commit y push.

30- En el frontend, añade tests de `server/api.ts`, `api-client.ts`, `middleware.ts` y `realtime/socket.ts`. Haz commit y push.

31- Crea una PR, apruébala y haz merge en la rama main.

## Fase 7 — Limpieza

32- Crea una rama `chore/cleanup-leftovers` para las siguientes acciones.

33- Elimina lo que trajeron `nest new` y `create-next-app` sin uso (`app.controller`, `page.module.css`, SVG de ejemplo), exports sin uso (`knip`, ⚠️ dependencia) y variables de entorno sin consumidor. Haz commit y push.

34- Crea `backend/requests.http` con peticiones reales (con cookies y CSRF). Haz commit y push.

35- Crea una PR, apruébala y haz merge en la rama main.

## Fase 8 — Dependencias y estilo

36- Crea una rama `build/dependencies-and-style` para las siguientes acciones.

37- Alinea las versiones de los paquetes de `@nestjs/*` y de React/Next en todos los workspaces, añade `engines`, `.nvmrc` y `overrides` solo donde haga falta, y verifica `npm ls` sin duplicados conflictivos. Haz commit y push.

38- Activa `typescript-eslint` `strictTypeChecked` en el backend y en `src/server` del frontend, y `exactOptionalPropertyTypes` y `noUncheckedIndexedAccess` en `tsconfig`. Corrige sin cambiar la lógica. Haz commit y push.

39- Crea una PR, apruébala y haz merge en la rama main.

## Fase 9 — Composición y contexto de petición

40- Crea una rama `refactor/composition-and-context` para las siguientes acciones.

41- Elimina los `forwardRef` reorganizando dependencias (eventos internos con `@nestjs/event-emitter` donde un módulo solo necesita avisar a otro) y añade un test con `madge --circular` (⚠️ dependencia) en el CI. Haz commit y push.

42- Crea `common/clock` inyectable y sustituye cada `new Date()` y `Date.now()` de la lógica. Haz commit y push.

43- Crea un `RequestContext` con `AsyncLocalStorage` (request id, user id) usado por los logs, el publicador de eventos y los trabajos encolados (que lo propagan en los datos del job). Haz commit y push.

44- Documenta y fija con un test el orden global: logger → request context → helmet → CORS → throttler → guards (auth, hogar) → pipes → interceptores → filtro de excepciones. Un 401 y un 429 llevan `X-Request-Id`. Haz commit y push.

45- Crea una PR, apruébala y haz merge en la rama main.

## Fase 10 — Worker separado de la API

46- Crea una rama `refactor/worker-module` para las siguientes acciones.

47- Crea un `WorkerModule` que importe solo los módulos de dominio necesarios y los procesadores, sin controladores ni gateway, y un `ApiModule` sin procesadores. Ambos comparten los módulos de dominio. Haz commit y push.

48- Crea una PR, apruébala y haz merge en la rama main.

## Fase 11 — Persistencia y rendimiento

49- Crea una rama `perf/mongo-indexes-and-queries` para las siguientes acciones.

50- Ejecuta `explain('executionStats')` de búsqueda, lista de recetas, plan y lista de la compra con el seed ×50, guarda los resultados en `docs/perf/` y ajusta índices (por ejemplo compuestos con `householdId` primero). Activa `autoIndex: false` en producción y crea los índices con un script de despliegue. Haz commit y push.

51- Sustituye la carga de recetas una a una al generar la lista por un único `$in` o un `aggregate` con `$lookup`. Los resultados no cambian. Haz commit y push.

52- Añade caché de Redis de corta duración para la búsqueda por etiquetas con invalidación por hogar. Haz commit y push.

53- Crea una PR, apruébala y haz merge en la rama main.

## Fase 12 — Observabilidad

54- Crea una rama `feat/observability` para las siguientes acciones.

55- ⚠️ dependencia — Instrumenta con OpenTelemetry (Fastify, Mongo, ioredis, BullMQ y el `fetch` del servidor de Next) con exportación OTLP opcional y `trace_id` en los logs de pino. Haz commit y push.

56- Expón métricas de colas (en espera, activos, fallidos) y de sockets conectados en un endpoint interno, y añade `/api/health/live` y `/api/health/ready` sin tocar `/api/health`. Haz commit y push.

57- Crea una PR, apruébala y haz merge en la rama main.

## Fase 13 — Contrato del tiempo real

58- Crea una rama `refactor/realtime-contract` para las siguientes acciones.

59- Tipa Socket.IO de extremo a extremo con las interfaces `ServerToClientEvents` y `ClientToServerEvents` de `packages/contracts`, usadas por el gateway, el emisor del worker y el cliente. Añade validación de los *payloads* en desarrollo. Haz commit y push.

60- Crea una PR, apruébala y haz merge en la rama main.

## Fase 14 — Suite de pruebas

61- Crea una rama `test/faster-suite` para las siguientes acciones.

62- Crea la app de Nest una vez por archivo de Jest como mucho, con una base de Mongo por *worker* y limpieza por colección; unifica fábricas y helpers. Mide el antes y el después en la PR. Haz commit y push.

63- Sustituye Jest por Vitest en el backend si mejora claramente los tiempos (⚠️ dependencia; con `unplugin-swc` para los decoradores), o documenta por qué no. Haz commit y push.

64- Crea una PR, apruébala y haz merge en la rama main.

## Fase 15 — Frontend: límites cliente/servidor

65- Crea una rama `refactor/frontend-boundaries` para las siguientes acciones.

66- Reorganiza `src/` por features, añade `server-only` y `client-only` donde corresponda y una regla de lint que impida importar `src/server` desde Client Components. Haz commit y push.

67- Carga `realtime/socket.ts` solo en las rutas que lo usan (dentro de un Client Component montado allí) y verifica con el analizador de bundles que no aparece en las demás. Haz commit y push.

68- Añade umbrales de cobertura a Vitest (valor medido − 2). Haz commit y push.

69- Crea una PR, apruébala y haz merge en la rama main.

## Fase 16 — CI

70- Crea una rama `ci/pipeline-optimization` para las siguientes acciones.

71- Elimina la duplicación de jobs, cachea `.next/cache` y los navegadores de Playwright, y usa la caché de BuildKit `type=gha`. Ejecuta solo los workspaces afectados en las PR cuando sea seguro. Haz commit y push.

72- Fija todas las acciones por SHA y crea `.github/dependabot.yml` para `npm` (raíz del workspace), `github-actions` y `docker`, con grupos para `@nestjs/*` y `next`/`react`. Haz commit y push.

73- Añade el job `prod-smoke`: pila de producción con un override de test y el flujo crítico contra Caddy, fallando ante violaciones de CSP. Haz commit y push.

74- Crea una PR, apruébala y haz merge en la rama main.

## Fase 17 — Docker y escalado

75- Crea una rama `chore/docker-and-scaling` para las siguientes acciones.

76- Fija por digest las imágenes base, añade `make smoke-prod` y revisa los tamaños de imagen (documenta el antes y el después). Haz commit y push.

77- Verifica con un compose de prueba dos réplicas de la API y dos workers: los eventos de Socket.IO llegan desde cualquier réplica (adaptador Redis), el throttling es global (Redis) y ningún trabajo se procesa dos veces. Documenta el resultado. Haz commit y push.

78- Crea una PR, apruébala y haz merge en la rama main.

## Fase 18 — Documentación

79- Crea una rama `docs/architecture-refresh` para las siguientes acciones.

80- Corrige el README con los conteos reales de tests, los targets del `Makefile` y el arranque que valida el CI. Haz commit y push.

81- Añade a `docs/architecture.md` la "Estructura de módulos" con un diagrama Mermaid y convierte en ADRs numerados: embeber frente a referenciar, rotación con ventana de gracia, refresh en el middleware de Next, URLs prefirmadas, SSRF, actualizaciones atómicas de arrays y semanas en la zona del hogar. Convierte `docs/README.md` en un índice. Haz commit y push.

82- Crea `CONTRIBUTING.md` con ramas, commits, verificación y las dos reglas: "un refactor no cambia comportamiento: primero un test de caracterización" y "una corrección empieza con un test que reproduce el defecto". Haz commit y push.

83- Crea una PR, apruébala y haz merge en la rama main.

---

# Apéndice — Hallazgos a verificar

> Estado tras la Fase 0. La evidencia (archivo y línea) y los hallazgos nuevos H11–H18 están en
> [`docs/architecture-review.md`](docs/architecture-review.md).

| # | Hallazgo candidato | Cómo se verifica | Impacto | Estado | Se corrige en |
| --- | --- | --- | --- | --- | --- |
| H1 | Refresh simultáneo de dos pestañas revoca la familia | Test con dos refresh paralelos | Cierres de sesión aleatorios | confirmado | Fase 1 |
| H2 | Middleware de Next refrescando de más | Contar llamadas a `/refresh` | Latencia y carga | descartado | — |
| H3 | `fetch` del servidor de Next cacheado entre usuarios | Dos usuarios en paralelo | Fuga de datos | descartado | — |
| H4 | Acceso a `Model` fuera de los repositorios, sin filtro de hogar | `grep` + tests de aislamiento | Lectura de otros hogares | descartado | — |
| H5 | Documentos de Mongoose serializados tal cual | Buscar `__v`/`passwordHash` en respuestas | Fuga de campos internos | parcial | Fase 3 |
| H6 | Objetos huérfanos en MinIO | Listar objetos sin receta | Coste y datos sin dueño | confirmado | Fase 4 |
| H7 | Trabajos de BullMQ no idempotentes y sin limpieza | Encolar dos veces; `KEYS bull:*` | Duplicados y Redis creciente | parcial | Fase 4 |
| H8 | Unidades calculadas distinto en back y front | Tabla de casos compartida | Cantidades que no cuadran | descartado | — |
| H9 | `weekStart` calculado en UTC | Domingo por la noche en UTC−5 | Plan de la semana equivocada | confirmado | Fase 5 |
| H10 | El `SafeHttpClient` no revalida la IP en cada redirección | Test de redirección a IP privada | SSRF | descartado | — |
