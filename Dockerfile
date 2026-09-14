########################################
# Stage 1: Build
########################################
FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# CA cert needed at build time for prisma generate against Aiven Postgres
COPY certs/ca.pem /app/certs/ca.pem
ENV NODE_EXTRA_CA_CERTS=/app/certs/ca.pem

# Placeholder DB URL so prisma generate doesn't fail at build time.
# Real DATABASE_URL is provided at runtime via env vars.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"

RUN npx prisma generate
RUN npm run build

# Strip devDependencies now that the build is done
RUN npm prune --omit=dev

########################################
# Stage 2: Runtime
########################################
FROM node:24-alpine

WORKDIR /app

# Only copy what's needed to actually run the app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/certs/ca.pem ./certs/ca.pem
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

ENV NODE_EXTRA_CA_CERTS=/app/certs/ca.pem
ENV NODE_ENV=production

EXPOSE 3000

CMD ["sh", "-c", "npm run start"]