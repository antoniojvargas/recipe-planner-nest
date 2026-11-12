# @recipe-planner/contracts

Tipos y constantes que la API, el worker y la web comparten: nombres y cargas útiles de los
eventos de Socket.IO, el sobre de errores y el catálogo de unidades de medida.

```ts
import {
  SOCKET_EVENTS,
  UNITS,
  isUnit,
  type ShoppingItemUpdatedPayload,
} from '@recipe-planner/contracts';
```

Solo datos: sin dependencias, sin lógica de servidor y sin acceso a Node ni al DOM. Se compila
con `npm run build -w @recipe-planner/contracts` y los consumidores leen `dist/` a través de
`exports`. Las reglas de qué entra y qué no están en `docs/architecture.md`.
