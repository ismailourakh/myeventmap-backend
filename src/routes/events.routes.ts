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
 */
eventsRouter.get("/mine", requireAuth, requireRole("ORGANIZER", "ADMIN"), async (req, res) => {
  const events = await prisma.event.findMany({
    where: { organizerId: req.user!.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { bookings: true } } },
  });

  return res.json({
    events: events.map((event) => ({
      ...event,
      seatsLeft: event.availableSeats,
      bookingsCount: event._count.bookings,
    })),
  });
});

/**
 * ORGANIZER/ADMIN: get one of my events by id
 * GET /events/mine/:id
 */
eventsRouter.get("/mine/:id", requireAuth, requireRole("ORGANIZER", "ADMIN"), async (req, res) => {
  const p = idParamSchema.safeParse(req.params);
  if (!p.success) return res.status(400).json({ message: "Invalid id" });
  const { id } = p.data;

  const event = await prisma.event.findUnique({
    where: { id },
    include: { _count: { select: { bookings: true } } },
  });

  if (!event) return res.status(404).json({ message: "Event not found" });

  const isAdmin = req.user!.role === "ADMIN";
  if (!isAdmin && event.organizerId !== req.user!.id) {
    return res.status(403).json({ message: "Forbidden" });
  }

  return res.json({
    event: {
      ...event,
      seatsLeft: event.availableSeats,
      bookingsCount: event._count.bookings,
    },
  });
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
              { postcode: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { startDate: "asc" },
    include: {
      organizer: { select: { id: true, name: true, email: true } },
      _count: { select: { bookings: true } },
    },
  });

  return res.json({
    events: events.map((event) => ({
      ...event,
      seatsLeft: event.availableSeats,
      bookingsCount: event._count.bookings,
    })),
  });
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
    include: {
      organizer: { select: { id: true, name: true, email: true } },
      _count: { select: { bookings: true } },
    },
  });

  if (!event) return res.status(404).json({ message: "Event not found" });

  return res.json({
    event: {
      ...event,
      seatsLeft: event.availableSeats,
      bookingsCount: event._count.bookings,
    },
  });
});

/**
 * AUTHENTICATED USER: book a ticket for a published event
 * POST /events/:id/book
 */
eventsRouter.post("/:id/book", requireAuth, async (req, res) => {
  const p = idParamSchema.safeParse(req.params);
  if (!p.success) return res.status(400).json({ message: "Invalid id" });
  const { id } = p.data;

  try {
    const booking = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<any[]>`
        SELECT *
        FROM "Event"
        WHERE id = ${id}
        FOR UPDATE
      `;

      const currentEvent = rows[0];
      if (!currentEvent || currentEvent.status !== "PUBLISHED") {
        throw new Error("EVENT_NOT_FOUND");
      }

      const existing = await tx.booking.findUnique({
        where: {
          userId_eventId: {
            userId: req.user!.id,
            eventId: id,
          },
        },
      });

      if (existing) throw new Error("ALREADY_BOOKED");
      if (currentEvent.availableSeats <= 0) throw new Error("EVENT_FULL");

      await tx.event.update({
        where: { id },
        data: {
          availableSeats: { decrement: 1 },
        },
      });

      return tx.booking.create({
        data: {
          userId: req.user!.id,
          eventId: id,
        },
        include: {
          event: {
            select: {
              id: true,
              title: true,
              location: true,
              postcode: true,
              startDate: true,
            },
          },
        },
      });
    });

    return res.status(201).json({ booking });
  } catch (err: any) {
    if (err.message === "EVENT_NOT_FOUND") return res.status(404).json({ message: "Event not found" });
    if (err.message === "EVENT_FULL") return res.status(400).json({ message: "Event is fully booked" });
    if (err.message === "ALREADY_BOOKED") return res.status(400).json({ message: "You already booked this event" });
    return res.status(500).json({ message: "Booking failed" });
  }
});

/**
 * ORGANIZER/ADMIN: create event
 * POST /events
 */
eventsRouter.post("/", requireAuth, requireRole("ORGANIZER", "ADMIN"), async (req, res) => {
  const bodySchema = z.object({
    title: z.string().min(3),
    description: z.string().max(2000).optional(),
    location: z.string().max(255).optional(),
    postcode: z.string().max(20).optional(),
    includesFood: z.coerce.boolean().optional(),
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    capacity: z.coerce.number().int().positive(),
    status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED"]).optional(),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
  }

  const { title, description, location, postcode, includesFood, startDate, endDate, capacity, status } = parsed.data;

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (end <= start) return res.status(400).json({ message: "endDate must be after startDate" });

  const event = await prisma.event.create({
    data: {
      title,
      description: description ?? null,
      location: location ?? null,
      postcode: postcode ?? null,
      includesFood: includesFood ?? false,
      startDate: start,
      endDate: end,
      capacity,
      availableSeats: capacity,
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
    postcode: z.string().max(20).nullable().optional(),
    includesFood: z.coerce.boolean().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    capacity: z.coerce.number().int().positive().optional(),
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

  const nextCapacity = parsed.data.capacity ?? existing.capacity;
  const bookedCount = await prisma.booking.count({ where: { eventId: id } });
  const nextAvailableSeats = Math.max(0, nextCapacity - bookedCount);

  const event = await prisma.event.update({
    where: { id },
    data: {
      ...parsed.data,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : undefined,
      availableSeats: parsed.data.capacity !== undefined ? nextAvailableSeats : undefined,
    },
    include: {
      organizer: { select: { id: true, name: true, email: true } },
      _count: { select: { bookings: true } },
    },
  });

  return res.json({
    event: {
      ...event,
      seatsLeft: event.availableSeats,
      bookingsCount: event._count.bookings,
    },
  });
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

/**
 * ORGANIZER/ADMIN: attendees of one event
 * GET /events/:id/attendees
 */
eventsRouter.get("/:id/attendees", requireAuth, requireRole("ORGANIZER", "ADMIN"), async (req, res) => {
  const p = idParamSchema.safeParse(req.params);
  if (!p.success) return res.status(400).json({ message: "Invalid id" });
  const { id } = p.data;

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return res.status(404).json({ message: "Event not found" });

  const isAdmin = req.user!.role === "ADMIN";
  if (!isAdmin && event.organizerId !== req.user!.id) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const attendees = await prisma.booking.findMany({
    where: { eventId: id },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  return res.json({ attendees });
});