import { Router } from "express";
import {
  history,
  postBreakEnd,
  postBreakStart,
  postClockIn,
  postClockOut,
  today,
} from "../controllers/attendance.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.use(requireAuth);

router.get("/today", today);
router.get("/history", history);
router.post("/clock-in", postClockIn);
router.post("/break-start", postBreakStart);
router.post("/break-end", postBreakEnd);
router.post("/clock-out", postClockOut);

export default router;
