FROM node:24-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# CA cert for Aiven Postgres TLS verification (COPY . . already includes it,
# this line is just here for clarity/explicitness)
COPY certs/ca.pem /app/certs/ca.pem
ENV NODE_EXTRA_CA_CERTS=/app/certs/ca.pem

# build-time only so prisma generate won't fail ( just a placeholder for db, main db will override by AWS App Runner vars env)

RUN echo "DATABASE_URL=postgresql://user:pass@localhost:5432/placeholder" > .env
RUN npx prisma generate

RUN npm run build

EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]