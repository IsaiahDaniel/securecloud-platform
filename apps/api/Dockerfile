# syntax=docker/dockerfile:1

FROM node:22.22.1-alpine AS deps
WORKDIR /app
COPY --link package.json package-lock.json ./
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc,required=false \
    --mount=type=cache,target=/root/.npm \
    npm ci

FROM deps AS dev
COPY --link . .
RUN addgroup -S -g 1001 appgroup \
    && adduser -S -u 1001 -G appgroup appuser \
    && chown -R appuser:appgroup /app
ENV HOST=0.0.0.0 \
    PORT=3000
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT || 3000}/health`).then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["npm", "run", "start:dev"]

FROM deps AS build
COPY --link . .
RUN npm run build

FROM node:22.22.1-alpine AS prod-deps
WORKDIR /app
COPY --link package.json package-lock.json ./
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc,required=false \
    --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts

FROM node:22.22.1-alpine AS runtime
WORKDIR /app
RUN addgroup -S -g 1001 appgroup && \
    adduser -S -u 1001 -G appgroup appuser
COPY --link --chown=1001:1001 package.json ./
COPY --from=prod-deps --link --chown=1001:1001 /app/node_modules ./node_modules
COPY --from=build --link --chown=1001:1001 /app/dist ./dist
ENV HOST=0.0.0.0 \
    PORT=3000 \
    NODE_ENV=production
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT || 3000}/health`).then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
LABEL org.opencontainers.image.title="securecloud-api" \
      org.opencontainers.image.description="Secure Cloud Platform NestJS API"
ENTRYPOINT ["node", "dist/main.js"]
