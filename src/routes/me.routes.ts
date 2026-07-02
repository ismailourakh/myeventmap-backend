import { Router } from "express";
import { prisma } from "../prisma";
import { requireAuth } from "../middlewares/requireAuth";

export const meRouter = Router();

/**
 * Get my bookings
 * GET /me/bookings
 */
meRouter.get("/bookings", requireAuth, async (req, res) => {
  const bookings = await prisma.booking.findMany({
    where: {
      userId: req.user!.id,
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      event: {
        select: {
          id: true,
          title: true,
          location: true,
          startDate: true,
          endDate: true,
          status: true,
          capacity: true,
          availableSeats: true,
        },
      },
    },
  });

  return res.json({ bookings });
});