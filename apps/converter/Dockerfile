# Converter image — opendataloader needs a JVM; Office conversion needs LibreOffice.
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    default-jre-headless libreoffice-writer libreoffice-impress libreoffice-calc \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --no-frozen-lockfile && pnpm --filter @team-kms/converter build
CMD ["node", "apps/converter/dist/index.js"]
