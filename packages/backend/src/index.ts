import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import airtimeRouter from "./routes/airtime";

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "celosave-backend" });
});

app.use("/api/airtime", airtimeRouter);

app.listen(PORT, () => {
  console.log(`CeloSave backend running on port ${PORT}`);
});

export default app;
