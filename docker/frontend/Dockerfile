# 3K Kampüs LMS — Next.js frontend (dev + prod targets)
# Build context: repository root

FROM node:20-alpine AS base

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# ─── Development: next dev + bind-mounted source ────────────────────────────
FROM base AS dev

ENV HOSTNAME=0.0.0.0 \
    PORT=3000 \
    WATCHPACK_POLLING=true

EXPOSE 3000
CMD ["npm", "run", "dev"]

# ─── Production: next build + next start ────────────────────────────────────
FROM base AS prod-builder

ARG NEXT_PUBLIC_BACKEND_URL=http://backend:8000
ENV NEXT_PUBLIC_BACKEND_URL=${NEXT_PUBLIC_BACKEND_URL}

COPY frontend .
RUN npm run build

FROM node:20-alpine AS prod

WORKDIR /app

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000

ARG NEXT_PUBLIC_BACKEND_URL=http://backend:8000
ENV NEXT_PUBLIC_BACKEND_URL=${NEXT_PUBLIC_BACKEND_URL}

COPY --from=prod-builder /app/package.json /app/package-lock.json ./
COPY --from=prod-builder /app/node_modules ./node_modules
COPY --from=prod-builder /app/.next ./.next
COPY --from=prod-builder /app/public ./public
COPY --from=prod-builder /app/next.config.js ./next.config.js

EXPOSE 3000
CMD ["npm", "run", "start"]
