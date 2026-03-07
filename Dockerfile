FROM node:20-alpine

WORKDIR /app

# Instalar dependencias
COPY package*.json ./
RUN npm ci

# Copiar todo el código
COPY . .

# Build del frontend React
RUN npm run build

# Remover devDependencies para imagen más liviana
RUN npm prune --production

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

CMD ["node", "src/proxy.cjs"]
