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

## Reglas del workspace

- Un único `package-lock.json` en la raíz; los workspaces (`backend`, `frontend`, `e2e`,
  `packages/*`) no tienen lockfile propio.
- Los paquetes compartidos se compilan antes que sus consumidores: `npm run build` en la raíz
  recorre los workspaces en orden.
