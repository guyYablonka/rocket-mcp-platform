FROM node:20-alpine

WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src ./src
COPY config ./config
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
USER node
EXPOSE 3100
CMD ["node", "dist/server.js"]
