import jwt from "jsonwebtoken";
import { Router } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import { prisma } from "../prisma";

export const authRouter = Router();

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

authRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid input",
      errors: parsed.error.flatten(),
    });
  }

  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ message: "Email already in use" });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      // role defaults to PARTICIPANT in schema
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    },
  });

  return res.status(201).json({ user });
});
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid input",
      errors: parsed.error.flatten(),
    });
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ message: "Invalid email or password" });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ message: "Invalid email or password" });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return res.status(500).json({ message: "JWT_SECRET is not set" });
  }

  const token = jwt.sign(
    { sub: user.id, role: user.role },
    secret,
    { expiresIn: "7d" }
  );

  return res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    },
  });
});

authRouter.get("/me", async (req, res) => {
  const header = req.header("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) return res.status(401).json({ message: "Missing Bearer token" });

  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).json({ message: "JWT_SECRET is not set" });

  try {
    const payload = jwt.verify(token, secret) as { sub?: string; role?: string };
    if (!payload.sub) return res.status(401).json({ message: "Invalid token" });

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    if (!user) return res.status(401).json({ message: "User not found" });

    return res.json({ user });
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
});