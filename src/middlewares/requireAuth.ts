import "dotenv/config";
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) return res.status(401).json({ message: "Missing Bearer token" });

  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).json({ message: "JWT_SECRET is not set" });

  try {
    const payload = jwt.verify(token, secret) as { sub?: string; role?: string };

    if (!payload.sub || !payload.role) {
      return res.status(401).json({ message: "Invalid token" });
    }

    req.user = { id: payload.sub, role: payload.role as any };
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}