# syntax=docker/dockerfile:1
FROM docker.io/oven/bun:1.3.13 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile
COPY public ./public
RUN bunx esbuild public/app.ts --outfile=public/app.js --bundle --format=esm --target=esnext

FROM docker.io/oven/bun:1.3.13 AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json bun.lock ./
COPY src ./src
COPY migrations ./migrations
COPY public ./public
COPY --from=build /app/public/app.js ./public/app.js
EXPOSE 3000
CMD ["bun", "src/server.ts"]
