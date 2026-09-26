FROM base AS runtime
ENV NODE_ENV=production

RUN apk add --no-cache openssl

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./

RUN mkdir -p /app/storage /app/keys
EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]