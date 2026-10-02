import "dotenv/config";
import "express-async-errors";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import { fail, ok } from "./lib/api-response";
import authRoutes from "./routes/auth.routes";
import attendanceRoutes from "./routes/attendance.routes";
import adminRoutes from "./routes/admin.routes";

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get("/health", (_req, res) => ok(res, { status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/admin", adminRoutes);

app.use((_req: Request, res: Response) => {
  fail(res, 404, "The requested resource was not found.");
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  fail(res, 500, "Something went wrong. Please try again.");
});

app.listen(PORT, () => {
  console.log(`Hush Lush attendance backend listening on port ${PORT}`);
});
