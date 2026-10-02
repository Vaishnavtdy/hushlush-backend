import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const adminAttendanceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  search: z.string().trim().optional().default(""),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD").optional(),
  status: z.enum(["NOT_STARTED", "CLOCKED_IN", "ON_BREAK", "CLOCKED_OUT"]).optional(),
});
export type AdminAttendanceQuery = z.infer<typeof adminAttendanceQuerySchema>;

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

export const attendanceHistoryQuerySchema = z
  .object({
    from: dateKey,
    to: dateKey,
  })
  .refine(({ from, to }) => from <= to, { message: "from must not be after to", path: ["from"] })
  .refine(
    ({ from, to }) => {
      const days = (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000;
      return days <= 31;
    },
    { message: "Date range must not exceed 31 days", path: ["to"] },
  );
export type AttendanceHistoryQuery = z.infer<typeof attendanceHistoryQuerySchema>;
