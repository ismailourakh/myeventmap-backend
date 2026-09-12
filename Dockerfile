FROM node:24-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy application
COPY . .

# CA certificate for Aiven PostgreSQL TLS verification
COPY certs/ca.pem /app/certs/ca.pem

ENV NODE_EXTRA_CA_CERTS=/app/certs/ca.pem

# Build-time DATABASE_URL only
# This is NOT the production database URL.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"

# Prisma needs DATABASE_URL during generate
RUN echo "DATABASE_URL=postgresql://user:pass@localhost:5432/placeholder" > .env

RUN npx prisma generate

# Build TypeScript/application
RUN npm run build

# Application port
EXPOSE 3000

# Start the application
CMD ["npm", "run", "start"]