import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient, UserRole } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const email = process.env.ADMIN_EMAIL ?? "admin@myeventmap.com";
  const password = process.env.ADMIN_PASSWORD ?? "Admin123!";
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) throw new Error("DATABASE_URL missing");

  const pool = new Pool({
  connectionString: databaseUrl,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.on("error", (err) => {
  console.error(err);
});
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      name: "Admin",
      role: UserRole.ADMIN,
      passwordHash,
    },
    create: {
      name: "Admin",
      email,
      role: UserRole.ADMIN,
      passwordHash,
    },
    select: { id: true, email: true, role: true, createdAt: true },
  });

  console.log("Seeded admin:", admin);

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});