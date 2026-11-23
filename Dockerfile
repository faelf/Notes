# Stage 1: Build frontend assets
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

# Stage 2: Production runtime (self-contained, non-root)
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV FORCE_BIND_ALL=true
ENV ENV_FILE=/app/.env
ENV COOKIE_SECURE=auto

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY scripts ./scripts
COPY --from=builder /app/dist ./dist
COPY .env ./.env

# Ensure app dir is writable by `node` so Notes/ is created cleanly on first launch
RUN chown -R node:node /app && chmod 600 /app/.env

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server/index.js"]
