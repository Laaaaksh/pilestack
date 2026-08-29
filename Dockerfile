# syntax=docker/dockerfile:1
FROM node:26-slim AS base
# Prisma's query engine needs to detect libssl to pick the right binary target.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

FROM base AS builder
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm exec prisma generate
RUN pnpm exec next build

FROM base AS runner
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
# Production-only install, so this stage never carries devDependencies —
# `prisma` (the CLI, needed at startup for `migrate deploy`) is a regular
# dependency for exactly this reason.
RUN pnpm install --prod --frozen-lockfile
RUN pnpm exec prisma generate

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY docker-entrypoint.sh ./

RUN groupadd --system --gid 1001 pilestack \
  && useradd --system --create-home --uid 1001 --gid pilestack pilestack \
  && mkdir -p /app/data \
  && chown pilestack:pilestack /app/data

USER pilestack
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
VOLUME ["/app/data"]

ENTRYPOINT ["./docker-entrypoint.sh"]
