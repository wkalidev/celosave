import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import airtimeRouter from "./routes/airtime";
import analyticsRouter from "./routes/analytics";
import { initDb } from "./lib/db";
import { assertProductionConfigSafe } from "./lib/config-guard";

dotenv.config();

assertProductionConfigSafe();

const app = express();
const PORT = process.env.PORT ?? 3001;

// CORS_ORIGIN: comma-separated list of allowed origins. No wildcard default —
// an unset value fails closed to "no cross-origin access" rather than "*".
const allowedOrigins = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow same-origin/non-browser requests (no Origin header) and health checks.
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  })
);
app.use(express.json());

const globalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "celosave-backend" });
});

app.use("/api/airtime", airtimeRouter);
app.use("/api/analytics", analyticsRouter);

// Catch-all error handler — must be registered last. Prevents any thrown
// error (e.g. the CORS middleware's rejection) from falling through to
// Express's default handler, which renders a full stack trace to the client.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({ error: "Not allowed by CORS" });
  }
  if ((err as { type?: string }).type === "entity.parse.failed") {
    return res.status(400).json({ error: "Malformed JSON body" });
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`CeloSave backend running on port ${PORT}`);
  });
}

if (require.main === module) {
  start();
}

export default app;
