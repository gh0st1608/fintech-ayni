# Imagen de la API para ECS Fargate (ADR, docs/architecture.md). Es la misma en dev (floci) y en
# prd: la configuración llega por variables de entorno y secretos de la task definition.
ARG NODE_IMAGE=node:22.23.3-alpine

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --ignore-scripts
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
# Sin root: la task definition además monta el sistema de archivos como solo lectura.
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
