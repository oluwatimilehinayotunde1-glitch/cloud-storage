FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production

# node_modules must come from the BUILD stage, not deps: `prisma generate`
# writes the generated client into node_modules/.prisma, and copying from
# deps silently shipped an ungenerated client, so every query threw
# "@prisma/client did not initialize yet" at runtime.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./

RUN mkdir -p /app/storage /app/keys
RUN apt-get update -y && apt-get install -y openssl
EXPOSE 4000

# `migrate deploy` only applies migrations that are committed to
# prisma/migrations. Run `npx prisma migrate dev --name init` once locally
# and commit the generated folder, or this starts against an empty schema.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
