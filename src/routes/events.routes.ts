import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";

export const eventsRouter = Router();

const idParamSchema = z.object({
  id: z.string().uuid(),
});

/**
 * ORGANIZER/ADMIN: list my events (any status)
 * GET /events/mine
 *
 * IMPORTANT: This must come BEFORE the /:id route below!
 */
eventsRouter.get("/mine", requireAuth, requireRole("ORGANIZER", "ADMIN"), async (req, res) => {
  const events = await prisma.event.findMany({
    where: {
      organizerId: req.user!.id,
    },
    orderBy: { createdAt: "desc" },
  });

  return res.json({ events });
});

/**
 * PUBLIC: list published events
 * GET /events?from=...&to=...&q=...
 */
eventsRouter.get("/", async (req, res) => {
  const querySchema = z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    q: z.string().min(1).optional(),
  });

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ message: "Invalid query" });

  const { from, to, q } = parsed.data;

  const events = await prisma.event.findMany({
    where: {
      status: "PUBLISHED",
      ...(from || to
        ? {
            startDate: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
              { location: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { startDate: "asc" },
    include: {
      organizer: { select: { id: true, name: true, email: true } },
    },
  });

  return res.json({ events });
});

/**
 * PUBLIC: get published event by id
 * GET /events/:id
 */
eventsRouter.get("/:id", async (req, res) => {
  const p = idParamSchema.safeParse(req.params);
  if (!p.success) return res.status(400).json({ message: "Invalid id" });
  const { id } = p.data;

  const event = await prisma.event.findFirst({
    where: { id, status: "PUBLISHED" },
    include: { organizer: { select: { id: true, name: true, email: true } } },
  });

  if (!event) return res.status(404).json({ message: "Event not found" });
  return res.json({ event });
});

/**
 * ORGANIZER/ADMIN: create event (defaults to DRAFT from schema)
 * POST /events
 */
eventsRouter.post("/", requireAuth, requireRole("ORGANIZER", "ADMIN"), async (req, res) => {
  const bodySchema = z.object({
    title: z.string().min(3),
    description: z.string().max(2000).optional(),
    location: z.string().max(255).optional(),
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED"]).optional(),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
  }

  const { title, description, location, startDate, endDate, status } = parsed.data;

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (end <= start) return res.status(400).json({ message: "endDate must be after startDate" });

  const event = await prisma.event.create({
    data: {
      title,
      description: description ?? null,
      location: location ?? null,
      startDate: start,
      endDate: end,
      status: status ?? "DRAFT",
      organizerId: req.user!.id,
    },
    include: { organizer: { select: { id: true, name: true, email: true } } },
  });

  return res.status(201).json({ event });
});

/**
 * ORGANIZER/ADMIN: update event
 * PUT /events/:id
 */
eventsRouter.put("/:id", requireAuth, requireRole("ORGANIZER", "ADMIN"), async (req, res) => {
  const p = idParamSchema.safeParse(req.params);
  if (!p.success) return res.status(400).json({ message: "Invalid id" });
  const { id } = p.data;

  const bodySchema = z.object({
    title: z.string().min(3).optional(),
    description: z.string().max(2000).nullable().optional(),
    location: z.string().max(255).nullable().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED"]).optional(),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
  }

  const existing = await prisma.event.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ message: "Event not found" });

  const isAdmin = req.user!.role === "ADMIN";
  if (!isAdmin && existing.organizerId !== req.user!.id) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const nextStart = parsed.data.startDate ? new Date(parsed.data.startDate) : existing.startDate;
  const nextEnd = parsed.data.endDate ? new Date(parsed.data.endDate) : existing.endDate;
  if (nextEnd <= nextStart) return res.status(400).json({ message: "endDate must be after startDate" });

  const event = await prisma.event.update({
    where: { id },
    data: {
      ...parsed.data,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : undefined,
    },
    include: { organizer: { select: { id: true, name: true, email: true } } },
  });

  return res.json({ event });
});

/**
 * ORGANIZER/ADMIN: delete event
 * DELETE /events/:id
 */
eventsRouter.delete("/:id", requireAuth, requireRole("ORGANIZER", "ADMIN"), async (req, res) => {
  const p = idParamSchema.safeParse(req.params);
  if (!p.success) return res.status(400).json({ message: "Invalid id" });
  const { id } = p.data;

  const existing = await prisma.event.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ message: "Event not found" });

  const isAdmin = req.user!.role === "ADMIN";
  if (!isAdmin && existing.organizerId !== req.user!.id) {
    return res.status(403).json({ message: "Forbidden" });
  }

  await prisma.event.delete({ where: { id } });
  return res.status(204).send();
});