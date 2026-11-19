# Imagen de desarrollo de la web. El contexto de build es la raíz del repositorio:
#   docker build -f frontend/Dockerfile -t recipes-frontend-dev .
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=development
# `next dev` escribe los tipos generados y la caché en `.next`, dentro del contenedor.
ENV NEXT_TELEMETRY_DISABLED=1

# Manifiestos de todos los workspaces: esta capa solo se invalida si cambian las dependencias.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
COPY packages/contracts/package.json ./packages/contracts/
RUN npm ci

# El paquete compartido se compila dentro de la imagen: la web importa sus tipos y constantes.
COPY packages/contracts/tsconfig.json ./packages/contracts/
COPY packages/contracts/src ./packages/contracts/src
RUN npm run build -w @recipe-planner/contracts

# Solo el código: `node_modules` del host no entra en la imagen (y en desarrollo se monta encima).
COPY frontend/next.config.ts frontend/tsconfig.json frontend/postcss.config.mjs frontend/eslint.config.mjs ./frontend/
COPY frontend/src ./frontend/src
COPY frontend/public ./frontend/public

EXPOSE 3001

# El puerto 3001 y el host 0.0.0.0 son obligatorios dentro del contenedor:
# Next escucha en localhost por defecto y no sería accesible desde fuera.
CMD ["npm", "run", "dev", "-w", "frontend", "--", "--port", "3001", "--hostname", "0.0.0.0"]
