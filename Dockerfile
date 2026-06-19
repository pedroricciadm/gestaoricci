# Sistema de Gestão Grupo RICCI — imagem de produção
FROM node:24-bookworm-slim

# build tools p/ compilar better-sqlite3 caso não haja binário pré-compilado
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# o banco SQLite vive num volume persistente montado em /app/data
ENV NODE_ENV=production \
    DATA_DIR=/app/data \
    PORT=3500

EXPOSE 3500
CMD ["node", "server.js"]
