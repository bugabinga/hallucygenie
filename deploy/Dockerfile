# syntax=docker/dockerfile:1.7
ARG BUN_VERSION=1.3.14
ARG VERSION=1.0.0

FROM docker.io/oven/bun:${BUN_VERSION} AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache,sharing=locked \
    bun install --frozen-lockfile

FROM deps AS build
COPY public ./public
RUN bunx esbuild public/app.ts \
    --outfile=public/app.js \
    --bundle \
    --format=esm \
    --target=esnext \
    --minify

FROM docker.io/oven/bun:${BUN_VERSION} AS runtime
ARG VERSION=1.0.0
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000
LABEL org.opencontainers.image.title="HallucyGenie" \
      org.opencontainers.image.description="Kid-friendly MiniMax creative web UI" \
      org.opencontainers.image.source="https://github.com/bugabinga/hallucygenie" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}"
COPY --chown=bun:bun package.json bun.lock ./
COPY --chown=bun:bun src ./src
COPY --chown=bun:bun migrations ./migrations
COPY --chown=bun:bun public ./public
COPY --from=build --chown=bun:bun /app/public/app.js ./public/app.js
RUN mkdir -p data logs && chown -R bun:bun data logs
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD bun --eval "const port=process.env.PORT||'3000';fetch('http://127.0.0.1:'+port+'/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "src/server.ts"]
