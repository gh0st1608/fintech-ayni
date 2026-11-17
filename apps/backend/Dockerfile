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

# Bundle de CA de Amazon RDS: la base exige TLS (rds.force_ssl) y su raíz no está en el almacén
# de Node, así que sin esto la verificación del certificado falla. Es público, no es un secreto, y
# se descarga por HTTPS en el build. La API lo usa con DB_SSL_CA_FILE; en floci no hace falta.
ARG RDS_CA_REGION=us-east-1
ADD --chown=node:node \
  https://truststore.pki.rds.amazonaws.com/${RDS_CA_REGION}/${RDS_CA_REGION}-bundle.pem \
  /app/certs/rds-ca.pem

COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
# Sin root: la task definition además monta el sistema de archivos como solo lectura.
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
