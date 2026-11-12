# Imagen de desarrollo de la API. El contexto de build es la raíz del repositorio,
# porque el lockfile y los manifiestos viven en el workspace:
#   docker build -f backend/Dockerfile -t recipes-backend-dev .
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=development

# Manifiestos de todos los workspaces: esta capa solo se invalida si cambian las dependencias.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
COPY packages/contracts/package.json ./packages/contracts/
RUN npm ci

# Solo el código: `node_modules` del host no entra en la imagen (y en desarrollo se monta encima).
COPY backend/nest-cli.json backend/tsconfig.json backend/tsconfig.build.json ./backend/
COPY backend/src ./backend/src
COPY backend/test ./backend/test

EXPOSE 3000

CMD ["npm", "run", "start:dev", "-w", "backend"]
