FROM node:20-alpine:latest

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# build-time only so prisma generate won't fail ( just a placeholder for db, main db will override by AWS App Runner vars env)
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"

RUN npx prisma generate

RUN npm run build

EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]