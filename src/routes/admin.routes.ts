import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole("ADMIN"));

adminRouter.get("/organizer-applications", async (req, res) => {
  const q = z
    .object({
      status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
    })
    .safeParse(req.query);

  if (!q.success) return res.status(400).json({ message: "Invalid query" });

  const applications = await prisma.organizerApplication.findMany({
    where: q.data.status ? { status: q.data.status } : undefined,
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, email: true, name: true, role: true } } },
  });

  return res.json({ applications });
});

adminRouter.post("/organizer-applications/:id/approve", async (req, res) => {
  const { id } = req.params;

  const app = await prisma.organizerApplication.findUnique({ where: { id } });
  if (!app) return res.status(404).json({ message: "Application not found" });

  const result = await prisma.$transaction(async (tx) => {
    const updatedApp = await tx.organizerApplication.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedByAdminId: req.user!.id,
        approvedAt: new Date(),
      },
    });

    const updatedUser = await tx.user.update({
      where: { id: updatedApp.userId },
      data: { role: "ORGANIZER" },
      select: { id: true, email: true, name: true, role: true },
    });

    return { updatedApp, updatedUser };
  });

  return res.json(result);
});

adminRouter.post("/organizer-applications/:id/reject", async (req, res) => {
  const { id } = req.params;

  const app = await prisma.organizerApplication.findUnique({ where: { id } });
  if (!app) return res.status(404).json({ message: "Application not found" });

  const updatedApp = await prisma.organizerApplication.update({
    where: { id },
    data: { status: "REJECTED" },
  });

  return res.json({ application: updatedApp });
});