# @recipe-planner/contracts

Tipos y constantes que la API, el worker y la web comparten: nombres y cargas útiles de los
eventos de Socket.IO, el sobre de errores y el catálogo de unidades de medida.

```ts
import {
  SOCKET_EVENTS,
  UNITS,
  add,
  isUnit,
  normalize,
  scale,
  type ShoppingItemUpdatedPayload,
} from '@recipe-planner/contracts';
```

Datos y funciones puras: sin dependencias, sin acceso a Node ni al DOM. Las operaciones de
unidades (`normalize`, `add`, `scale`) solo leen el catálogo. `units-cases.json` reúne los casos
que comprueban a la vez el backend y el frontend. Se compila con
`npm run build -w @recipe-planner/contracts` y los consumidores leen `dist/` a través de
`exports`. Las reglas de qué entra y qué no están en `docs/architecture.md`.
