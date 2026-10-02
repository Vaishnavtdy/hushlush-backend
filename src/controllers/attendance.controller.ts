import { Request, Response } from "express";
import { Attendance, Break } from "@prisma/client";
import { fail, ok } from "../lib/api-response";
import {
  AttendanceError,
  clockIn,
  clockOut,
  computeElapsedWorkingSeconds,
  endBreak,
  getAttendanceRange,
  getOrCreateTodayAttendance,
  startBreak,
} from "../lib/attendance";
import { attendanceHistoryQuerySchema } from "../lib/validations";

type AttendanceWithBreaks = Attendance & { breaks: Break[] };

function serialize(attendance: AttendanceWithBreaks, now: Date) {
  const openBreak = attendance.breaks.find((b) => b.endedAt === null) ?? null;
  return {
    attendanceDate: attendance.attendanceDate.toISOString().slice(0, 10),
    status: attendance.status,
    clockIn: attendance.clockIn,
    clockOut: attendance.clockOut,
    totalBreakSeconds: attendance.totalBreakSeconds,
    totalWorkSeconds: attendance.totalWorkSeconds,
    elapsedWorkingSeconds: computeElapsedWorkingSeconds(attendance, now),
    currentBreakStartedAt: openBreak?.startedAt ?? null,
    breaks: attendance.breaks.map((b) => ({
      startedAt: b.startedAt,
      endedAt: b.endedAt,
      durationSeconds: b.durationSeconds,
    })),
    serverTime: now,
  };
}

async function handleTransition(
  req: Request,
  res: Response,
  transition: (userId: string) => Promise<AttendanceWithBreaks>,
) {
  try {
    const attendance = await transition(req.user!.userId);
    return ok(res, serialize(attendance, new Date()));
  } catch (error) {
    if (error instanceof AttendanceError) {
      return fail(res, error.statusCode, error.message);
    }
    throw error;
  }
}

export async function today(req: Request, res: Response) {
  const attendance = await getOrCreateTodayAttendance(req.user!.userId);
  return ok(res, serialize(attendance, new Date()));
}

export async function postClockIn(req: Request, res: Response) {
  return handleTransition(req, res, clockIn);
}

export async function postBreakStart(req: Request, res: Response) {
  return handleTransition(req, res, startBreak);
}

export async function postBreakEnd(req: Request, res: Response) {
  return handleTransition(req, res, endBreak);
}

export async function postClockOut(req: Request, res: Response) {
  return handleTransition(req, res, clockOut);
}

export async function history(req: Request, res: Response) {
  const parsed = attendanceHistoryQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return fail(res, 400, parsed.error.issues[0]?.message ?? "Invalid query parameters.");
  }
  const { from, to } = parsed.data;

  const records = await getAttendanceRange(req.user!.userId, from, to);
  const now = new Date();
  return ok(res, { days: records.map((record) => serialize(record, now)) });
}
