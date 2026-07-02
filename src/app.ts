import cors from "cors";
import express from "express";
import helmet from "helmet";
import { organizerApplicationsRouter } from "./routes/organizerApplications.routes";
import { adminRouter } from "./routes/admin.routes";

import { authRouter } from "./routes/auth.routes";
import { eventsRouter } from "./routes/events.routes";
import { meRouter } from "./routes/me.routes";


export const app = express();

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use("/organizer-applications", organizerApplicationsRouter);
app.use("/admin", adminRouter);

app.use("/auth", authRouter);
app.use("/events", eventsRouter);
app.use("/me", meRouter);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});