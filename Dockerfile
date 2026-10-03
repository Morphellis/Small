# Образ сайта: собранная страница (dist) и сервер подсчёта (dist-server/main.mjs) на Node.js.
#
#   docker compose up -d --build          — вместе с Caddy (HTTPS), см. docker-compose.yml
#   docker build -t trainer . && docker run -p 8080:8080 trainer      — только приложение, http://localhost:8080

# ---------- сборка: тесты типов, сайт, сервер, проверка утечек ----------
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---------- запуск: только Node и два собранных каталога — без исходников, тестов и node_modules ----------
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    STATIC_DIR=/app/dist \
    TRUST_PROXY=1
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/health > /dev/null || exit 1
CMD ["node", "dist-server/main.mjs"]
