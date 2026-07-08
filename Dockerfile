FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Needed only so prisma generate succeeds at build time
ENV DATABASE_URL="postgresql://postgres:postgres@postgres:5432/myeventmap"

RUN npx prisma generate

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]