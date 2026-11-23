# Pruebas E2E (Playwright)

Suite end-to-end sobre la pila completa de la aplicación en modo test, usando Playwright (Chromium).

## Requisitos

- Docker con Compose.
- Dependencias instaladas en la raíz del repositorio (`npm install`).

## Pila E2E

La pila se define en `docker-compose.e2e.yml` (`name: recipe-planner-e2e`) y levanta la app con datos efímeros:

- **Entorno:** `APP_ENV=test`, `NODE_ENV=test`.
- **Servicios:** `backend` (API, puerto `3000`), `worker`, `frontend` (puerto `3001`), `mongo` (replica set `rs0`, `27017`), `redis` (`6379`), `minio` (API S3 `9000`; la consola `9001` **no** se expone), `minio-init`, `mailpit` (SMTP `1025`, UI `8025`) y `fixtures` (servidor estático `nginx` en la red interna para fixtures de importación).
- **Datos efímeros:** Mongo y Redis usan `tmpfs`; el estado se pierde al bajar la pila.
- **Reset de datos (solo en test):** `POST /api/testing/reset` responde `204` y limpia las colecciones de Mongo y hace `FLUSHDB` en Redis. Está disponible únicamente con `APP_ENV=test`.

Levantar la pila (construye imágenes y espera a que esté lista):

```bash
docker compose -f docker-compose.e2e.yml up --build --wait
```

Bajarla:

```bash
docker compose -f docker-compose.e2e.yml down --remove-orphans
```

## Ejecución de las pruebas

Con la pila en marcha, desde la raíz del repositorio:

```bash
npm run test -w e2e
```

Solo pruebas de humo (`@smoke`):

```bash
npm run test:smoke -w e2e
```

Solo la auditoría de accesibilidad (`@axe-core/playwright`):

```bash
npm run test:a11y -w e2e
```

La auditoría recorre recetas, editor, plan y lista con un hogar y una receta ya creados y falla
si Axe encuentra violaciones de WCAG 2.1 A/AA o de buenas prácticas (`document-title`,
`landmark-one-main`, `region`, `page-has-heading-one`, …). Imprime el detalle de cada nodo
incumplido para poder corregirlo. Forma parte de la suite completa, así que también corre en CI.

Revisión a 360 px (ancho de móvil pequeño):

```bash
npm run test:mobile -w e2e
```

Comprueba que las vistas principales no tienen scroll horizontal, que la lista de la compra
tiene filas y controles de al menos 44 px con la acción «siguiente pendiente» fija abajo, y que
el modo cocina muestra pasos de al menos 24 px con botones de 64 px, pide y libera el Wake Lock
y se maneja con flechas y Escape. También forma parte de la suite de CI.

Otros scripts disponibles:

```bash
npm run test:ui -w e2e       # modo UI de Playwright
npm run test:headed -w e2e   # con navegador visible
npm run report -w e2e        # abre el último reporte HTML
```

> Nota: `make test-e2e` ejecuta también los tests e2e del backend; para correr únicamente la suite Playwright usa los scripts del workspace `e2e`.

## Configuración y variables de entorno

- **`E2E_BASE_URL`** (por defecto `http://localhost:3001`): URL base del frontend para las pruebas.
- **`E2E_API_URL`** (por defecto `http://localhost:3000`): URL base de la API (usada para llamadas directas de preparación/verificación desde los tests).
- **`CI`**: en CI se activa `forbidOnly`, 2 reintentos y 1 worker (ver `playwright.config.ts`).
- **`E2E_JWT_ACCESS_SECRET`** (opcional): secreto HS256 del access token en la pila E2E (por defecto `e2e-access-secret-with-32-characters-min`, alineado con `docker-compose.e2e.yml`), usado por pruebas que necesitan firmar tokens de sesión.

Reporter: HTML (`open: 'never'`) y listado en consola. Trazas: `on-first-retry`.

## Fixtures y notas

- Fixtures de pruebas en `e2e/tests/fixtures/` (p. ej. `recipe-photo.jpg`).
- **Importación desde URL:** el servicio `fixtures` expone `e2e/fixtures/import-server/` dentro de la red Docker (p. ej. `http://fixtures/recipe.html` con JSON-LD). La pila E2E permite ese host en la importación mediante `IMPORT_ALLOWED_HOSTS=fixtures` (whitelist activa solo con `APP_ENV=test`), de modo que el worker pueda descargarlo pese a resolverse a una IP privada de la red interna.
- Muchos tests preparan estado vía API (`/api/auth/register`, hogares, recetas, etc.) usando cookies/CSRF explícitos y realizan las comprobaciones clave en la UI.
