import { Router } from "express";
import { listAttendance } from "../controllers/admin.controller";
import { requireAdmin, requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.use(requireAuth, requireAdmin);

router.get("/attendance", listAttendance);

export default router;
