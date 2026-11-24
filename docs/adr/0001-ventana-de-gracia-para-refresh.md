# ADR 0001 — Ventana de gracia para refresh concurrente

- **Estado:** aceptada
- **Fecha:** 24 de noviembre de 2026
- **Fase:** 1 (hallazgo H1, riesgo R5)
- **Código:** `backend/src/auth/auth.constants.ts`, `backend/src/auth/auth.service.ts`

## Contexto

El refresh consume el token con un `findOneAndUpdate` atómico: de dos pestañas que presentan la
misma cookie, solo una marca `usedAt`. La otra entra en `classifyFailedClaim` y, al ver `usedAt`,
revocaba la familia entera. El _single-flight_ del frontend es por pestaña, así que no evita esta
carrera: dos pestañas legítimas provocaban un cierre de sesión espurio.

La rotación se apoya en dos garantías que conviene conservar:

- `usedAt` y la inserción del siguiente eslabón se confirman en la misma transacción, así que un
  token usado siempre tiene un sucesor.
- El refresh es opaco y **solo se persiste su SHA-256** (`refresh-session.schema.ts`), nunca en
  claro.

## Decisión

1. `REFRESH_ROTATION_GRACE_MS = 10_000` en `auth.constants.ts`.
2. Si el canje atómico falla y la fila tiene `usedAt` con
   `now - usedAt < REFRESH_ROTATION_GRACE_MS`, no se revoca nada: se emite un sucesor nuevo de la
   familia con access token nuevo, **dentro de la misma transacción**. La pestaña que llegó tarde
   obtiene credenciales válidas y la familia sigue abierta (`reissueSuccessor`).
3. Pasada la ventana, el comportamiento anterior queda intacto: `revokeFamily`, aviso de
   seguridad con `userId`/`familyId` y 401 `UNAUTHORIZED`.
4. La clasificación de un canje fallido pasa a comprobar, en este orden: `revokedAt`, `expiresAt`,
   `usedAt`. Antes `usedAt` ganaba a `revokedAt`, de modo que un replay tras un logout se
   registraba como robo. Ahora una familia revocada nunca se reabre ni emite credenciales.
5. No se guarda ni se reconstruye la cadena del refresh en claro. «Devolver el sucesor ya emitido»
   se materializa como **otro eslabón vivo de la misma familia**, con la misma forma y las mismas
   cookies que el que recibió la pestaña ganadora. Persistir el token (o derivarlo del anterior)
   rompería la garantía de que la base de datos solo guarda hashes.

## Consecuencias

- Dos pestañas que refrescan a la vez ya no se cierran la sesión mutuamente.
- Durante 10 s un token robado que ya fue canjeado puede volver a presentarse y obtener
  credenciales en lugar de delatar al ladrón. Es el coste explícito de la ventana; a partir de
  los 10 s la detección de reutilización y la revocación funcionan como antes.
- Pueden coexistir varios eslabones vivos en una familia durante la ventana. Todos pertenecen a la
  misma sesión, son de un solo uso y se revocan juntos en logout o en una reutilización tardía.
- El aviso de seguridad solo se emite en la reutilización fuera de ventana; un replay en gracia
  no contamina los logs.

## Alternativas descartadas

- **Derivar el sucesor de forma determinista** a partir del token presentado: quien obtuviera un
  token antiguo podría calcular offline todos los eslabones futuros, incluso después de que la
  familia rotara.
- **Persistir el sucesor en claro (o cifrado) en la fila usada:** reintroduce material de sesión en
  Mongo y contradice el diseño de `refresh-session.schema.ts`.
- **Single-flight global entre pestañas o instancias:** acopla el navegador al servidor y no cubre
  pestañas de dispositivos distintos; la ventana de gracia es la solución en el servidor.

## Verificación

`backend/src/auth/auth-rotation.service.spec.ts` cubre: dos refresh concurrentes, reemisión dentro
de la ventana, revocación en el límite de la ventana, reutilización tardía y replay de una familia
ya revocada. `backend/src/auth/auth.service.spec.ts` cubre la rama de gracia con reloj fijo.
