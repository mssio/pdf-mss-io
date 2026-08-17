# Stage 1: Build static assets
FROM oven/bun:debian AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# Stage 2: Production runtime
FROM oven/bun:debian

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends qpdf \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile

COPY --from=builder /app/dist ./dist
COPY src ./src
COPY tsconfig.json ./

RUN mkdir -p /app/data/tmp]
RUN chown -R bun:bun /app

ENV NODE_ENV=production

EXPOSE 3000

USER bun
CMD ["bun", "src/index.ts"]
