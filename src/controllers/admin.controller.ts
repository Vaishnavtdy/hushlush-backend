import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { fail, ok } from "../lib/api-response";
import { adminAttendanceQuerySchema } from "../lib/validations";
import { computeElapsedWorkingSeconds } from "../lib/attendance";

export async function listAttendance(req: Request, res: Response) {
  const parsed = adminAttendanceQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return fail(res, 400, parsed.error.issues[0]?.message ?? "Invalid query parameters.");
  }
  const { page, limit, search, date, status } = parsed.data;

  const where: Prisma.AttendanceWhereInput = {};
  if (status) where.status = status;
  if (date) where.attendanceDate = new Date(`${date}T00:00:00.000Z`);
  if (search) {
    where.user = {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { employeeId: { contains: search, mode: "insensitive" } },
      ],
    };
  }

  const [total, records] = await Promise.all([
    prisma.attendance.count({ where }),
    prisma.attendance.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            employeeId: true,
            avatar: true,
            department: true,
            location: true,
          },
        },
        breaks: { select: { startedAt: true, endedAt: true, durationSeconds: true } },
      },
      orderBy: [{ attendanceDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  const now = new Date();
  const data = records.map((record) => ({
    id: record.id,
    user: record.user,
    attendanceDate: record.attendanceDate,
    clockIn: record.clockIn,
    clockOut: record.clockOut,
    status: record.status,
    totalBreakSeconds: record.totalBreakSeconds,
    totalWorkSeconds:
      record.status === "CLOCKED_OUT" ? record.totalWorkSeconds : computeElapsedWorkingSeconds(record, now),
  }));

  return ok(res, {
    records: data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
}
