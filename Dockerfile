# Base image for the pure-Node services (api, mcp, web).
# The converter has its own Dockerfile (it needs a JVM + LibreOffice).
FROM node:22-slim
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --no-frozen-lockfile && pnpm -r --filter "!@team-kms/converter" build
# Service is selected via `command:` in docker-compose.yml.
