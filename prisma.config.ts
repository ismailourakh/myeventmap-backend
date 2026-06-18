import "dotenv/config";
import { defineConfig } from "prisma/config";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL missing in .env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx ts-node prisma/seed.ts"
  },
  datasource: {
    url,
  },
});