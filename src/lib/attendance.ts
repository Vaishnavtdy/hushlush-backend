import { Attendance, AttendanceStatus, Break } from "@prisma/client";
import { prisma } from "./prisma";

const APP_TIMEZONE = process.env.APP_TIMEZONE || "Asia/Kolkata";

export class AttendanceError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

/** Today's calendar date in APP_TIMEZONE, formatted YYYY-MM-DD. Server time is always authoritative. */
export function getTodayDateKey(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

/** Date-only value (UTC midnight) representing today's business day, for the @db.Date column. */
export function getTodayAttendanceDate(): Date {
  return new Date(`${getTodayDateKey()}T00:00:00.000Z`);
}

type AttendanceWithBreaks = Attendance & { breaks: Break[] };

export async function getOrCreateTodayAttendance(userId: string): Promise<AttendanceWithBreaks> {
  const attendanceDate = getTodayAttendanceDate();

  const existing = await prisma.attendance.findUnique({
    where: { userId_attendanceDate: { userId, attendanceDate } },
    include: { breaks: { orderBy: { startedAt: "asc" } } },
  });
  if (existing) return existing;

  return prisma.attendance.create({
    data: { userId, attendanceDate, status: AttendanceStatus.NOT_STARTED },
    include: { breaks: { orderBy: { startedAt: "asc" } } },
  });
}

export async function clockIn(userId: string): Promise<AttendanceWithBreaks> {
  return prisma.$transaction(async (tx) => {
    const attendanceDate = getTodayAttendanceDate();
    const existing = await tx.attendance.findUnique({
      where: { userId_attendanceDate: { userId, attendanceDate } },
    });

    if (existing) {
      if (existing.status === AttendanceStatus.CLOCKED_OUT) {
        throw new AttendanceError(409, "You have already completed attendance for today.");
      }
      if (existing.status !== AttendanceStatus.NOT_STARTED) {
        throw new AttendanceError(409, "You are already clocked in.");
      }
    }

    const now = new Date();
    const attendance = existing
      ? await tx.attendance.update({
          where: { id: existing.id },
          data: { clockIn: now, status: AttendanceStatus.CLOCKED_IN },
          include: { breaks: { orderBy: { startedAt: "asc" } } },
        })
      : await tx.attendance.create({
          data: { userId, attendanceDate, clockIn: now, status: AttendanceStatus.CLOCKED_IN },
          include: { breaks: { orderBy: { startedAt: "asc" } } },
        });

    return attendance;
  });
}

export async function startBreak(userId: string): Promise<AttendanceWithBreaks> {
  return prisma.$transaction(async (tx) => {
    const attendanceDate = getTodayAttendanceDate();
    const attendance = await tx.attendance.findUnique({
      where: { userId_attendanceDate: { userId, attendanceDate } },
    });

    if (!attendance || attendance.status === AttendanceStatus.NOT_STARTED) {
      throw new AttendanceError(409, "You must clock in before starting a break.");
    }
    if (attendance.status === AttendanceStatus.ON_BREAK) {
      throw new AttendanceError(409, "You are already on a break.");
    }
    if (attendance.status === AttendanceStatus.CLOCKED_OUT) {
      throw new AttendanceError(409, "Attendance already completed for today.");
    }

    const now = new Date();
    await tx.break.create({ data: { attendanceId: attendance.id, startedAt: now } });

    return tx.attendance.update({
      where: { id: attendance.id },
      data: { status: AttendanceStatus.ON_BREAK },
      include: { breaks: { orderBy: { startedAt: "asc" } } },
    });
  });
}

export async function endBreak(userId: string): Promise<AttendanceWithBreaks> {
  return prisma.$transaction(async (tx) => {
    const attendanceDate = getTodayAttendanceDate();
    const attendance = await tx.attendance.findUnique({
      where: { userId_attendanceDate: { userId, attendanceDate } },
    });

    if (!attendance || attendance.status !== AttendanceStatus.ON_BREAK) {
      throw new AttendanceError(409, "No active break found.");
    }

    const openBreak = await tx.break.findFirst({
      where: { attendanceId: attendance.id, endedAt: null },
      orderBy: { startedAt: "desc" },
    });
    if (!openBreak) {
      throw new AttendanceError(409, "No active break found.");
    }

    const now = new Date();
    const durationSeconds = Math.max(0, Math.floor((now.getTime() - openBreak.startedAt.getTime()) / 1000));

    await tx.break.update({
      where: { id: openBreak.id },
      data: { endedAt: now, durationSeconds },
    });

    return tx.attendance.update({
      where: { id: attendance.id },
      data: {
        status: AttendanceStatus.CLOCKED_IN,
        totalBreakSeconds: attendance.totalBreakSeconds + durationSeconds,
      },
      include: { breaks: { orderBy: { startedAt: "asc" } } },
    });
  });
}

export async function clockOut(userId: string): Promise<AttendanceWithBreaks> {
  return prisma.$transaction(async (tx) => {
    const attendanceDate = getTodayAttendanceDate();
    const attendance = await tx.attendance.findUnique({
      where: { userId_attendanceDate: { userId, attendanceDate } },
    });

    if (!attendance || attendance.status === AttendanceStatus.NOT_STARTED) {
      throw new AttendanceError(409, "You must clock in before clocking out.");
    }
    if (attendance.status === AttendanceStatus.ON_BREAK) {
      throw new AttendanceError(409, "Please end your break before clocking out.");
    }
    if (attendance.status === AttendanceStatus.CLOCKED_OUT) {
      throw new AttendanceError(409, "You have already clocked out.");
    }
    if (!attendance.clockIn) {
      throw new AttendanceError(409, "You must clock in before clocking out.");
    }

    const now = new Date();
    const elapsedSeconds = Math.floor((now.getTime() - attendance.clockIn.getTime()) / 1000);
    const totalWorkSeconds = Math.max(0, elapsedSeconds - attendance.totalBreakSeconds);

    return tx.attendance.update({
      where: { id: attendance.id },
      data: { clockOut: now, status: AttendanceStatus.CLOCKED_OUT, totalWorkSeconds },
      include: { breaks: { orderBy: { startedAt: "asc" } } },
    });
  });
}

type AttendanceForCalc = Pick<Attendance, "clockIn" | "clockOut" | "totalBreakSeconds"> & {
  breaks: Pick<Break, "startedAt" | "endedAt">[];
};

/**
 * Live working-seconds snapshot, usable for today's in-progress attendance.
 * Freezes during an open break: elapsed-since-clock-in growth is cancelled out by the
 * growth of the open break's own duration, so the figure does not move until the break ends.
 */
export function computeElapsedWorkingSeconds(attendance: AttendanceForCalc, now: Date = new Date()): number {
  if (!attendance.clockIn) return 0;

  const end = attendance.clockOut ?? now;
  const elapsedSeconds = Math.floor((end.getTime() - attendance.clockIn.getTime()) / 1000);

  const openBreak = attendance.breaks.find((b) => b.endedAt === null);
  const openBreakSeconds = openBreak
    ? Math.floor((now.getTime() - openBreak.startedAt.getTime()) / 1000)
    : 0;

  return Math.max(0, elapsedSeconds - attendance.totalBreakSeconds - openBreakSeconds);
}

/** A user's own attendance rows within [fromDateKey, toDateKey] (inclusive). Days with no row simply aren't returned. */
export async function getAttendanceRange(
  userId: string,
  fromDateKey: string,
  toDateKey: string,
): Promise<AttendanceWithBreaks[]> {
  return prisma.attendance.findMany({
    where: {
      userId,
      attendanceDate: {
        gte: new Date(`${fromDateKey}T00:00:00.000Z`),
        lte: new Date(`${toDateKey}T00:00:00.000Z`),
      },
    },
    include: { breaks: { orderBy: { startedAt: "asc" } } },
    orderBy: { attendanceDate: "asc" },
  });
}
