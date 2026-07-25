FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY vendor ./vendor
RUN npm ci
COPY src ./src
COPY express ./express
COPY fastify ./fastify
COPY nest ./nest
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3200
ENTRYPOINT ["node"]
CMD ["dist/express/mock-server.js"]
