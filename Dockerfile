# Base image for the pure-Node services (api, mcp, web).
# The converter has its own Dockerfile (it needs a JVM + LibreOffice).
FROM node:22-slim
ENV CI=true
RUN corepack enable
WORKDIR /app
COPY . .
# Next.js inlines NEXT_PUBLIC_* at build time. For the web image, pass these as
# --build-arg with PUBLIC URLs (hosted Supabase + api's Cloud Run URL); harmless
# for the api/mcp images, which ignore them.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm install --no-frozen-lockfile && pnpm -r --filter "!@team-kms/converter" build
# Service is selected via `command:` in docker-compose.yml.
