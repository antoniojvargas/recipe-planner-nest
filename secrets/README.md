# Secretos locales

Esta carpeta guarda los ficheros de secretos para desarrollo y para la pila de producción
local. **Nada de lo que va aquí se versiona**: `.gitignore` ignora `secrets/*.txt` (y todo
`.env*` salvo los `.example`).

## Uso

- Crea un fichero por secreto, con una sola línea y sin comillas: p. ej. `secrets/jwt_access_secret.txt`.
- Las variables de entorno dobles (`*_FILE`) apuntan a la ruta del fichero; la forma preferida
  es montarlo como Docker secret y leer `JWT_ACCESS_SECRET_FILE=/run/secrets/jwt_access_secret`.
- Si existen las dos formas, el valor plano (`JWT_ACCESS_SECRET`) gana sobre el fichero
  (`JWT_ACCESS_SECRET_FILE`).
- Los valores de ejemplo y la lista completa de variables viven en `.env.example` y
  `.env.production.example`; nunca pongas valores reales en esos ficheros.

## Reglas

- Sin secretos en el código, en el `README`, en los tests ni en los fixtures.
- Un secreto por fichero, sin espacios ni saltos de línea extra.
- No los compartas por chat ni por correo; usa un gestor de contraseñas.
- Si un secreto se filtra, rótalo y revoca las sesiones o credenciales afectadas.
