import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth } from "../middlewares/requireAuth";

export const organizerApplicationsRouter = Router();

const applySchema = z.object({
  message: z.string().max(500).optional(),
});

organizerApplicationsRouter.post("/", requireAuth, async (req, res) => {
  // only participants can apply
  if (req.user!.role !== "PARTICIPANT") {
    return res.status(400).json({ message: "Only participants can apply" });
  }

  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
  }

  const existing = await prisma.organizerApplication.findUnique({
    where: { userId: req.user!.id },
  });

  if (existing && existing.status === "PENDING") {
    return res.status(409).json({ message: "You already have a pending application" });
  }

  if (existing && existing.status === "APPROVED") {
    return res.status(409).json({ message: "Your application is already approved" });
  }

  // if REJECTED exists, we allow re-apply by updating it back to PENDING
  const app = existing
    ? await prisma.organizerApplication.update({
        where: { userId: req.user!.id },
        data: { status: "PENDING", message: parsed.data.message ?? null },
      })
    : await prisma.organizerApplication.create({
        data: { userId: req.user!.id, message: parsed.data.message ?? null },
      });

  return res.status(201).json({ application: app });
});

organizerApplicationsRouter.get("/me", requireAuth, async (req, res) => {
  const app = await prisma.organizerApplication.findUnique({
    where: { userId: req.user!.id },
  });

  return res.json({ application: app });
});