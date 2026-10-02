import "dotenv/config";
import { PrismaClient, AttendanceStatus } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

function dateKey(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

// Builds the UTC instant for a given wall-clock time in APP_TIMEZONE (Asia/Kolkata, UTC+5:30) —
// a literal "...Z" suffix would store 09:00 UTC, which displays as 2:30pm IST, not 9am.
function atTime(dateKeyStr: string, hh: number, mm: number): Date {
  return new Date(`${dateKeyStr}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00.000+05:30`);
}

async function main() {
  const adminPasswordHash = await bcrypt.hash("Admin@123", 12);
  const developerPasswordHash = await bcrypt.hash("Developer@123", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@hushlush.com" },
    update: {},
    create: {
      name: "Abdul Aziz",
      email: "admin@hushlush.com",
      passwordHash: adminPasswordHash,
      role: "ADMIN",
      department: "Human Resources",
      location: "Singapore",
      employeeId: "HL-ADM-001",
    },
  });

  const developer = await prisma.user.upsert({
    where: { email: "developer@hushlush.com" },
    update: {},
    create: {
      name: "Dominic Tay",
      email: "developer@hushlush.com",
      passwordHash: developerPasswordHash,
      role: "DEVELOPER",
      department: "Engineering",
      location: "Singapore",
      employeeId: "HL-DEV-001",
    },
  });

  console.log(`Seeded users: ${admin.email} (ADMIN), ${developer.email} (DEVELOPER)`);

  // Sample historical attendance so the admin table has data to show immediately.
  for (const user of [admin, developer]) {
    for (let daysAgo = 1; daysAgo <= 4; daysAgo++) {
      const day = dateKey(daysAgo);
      const clockIn = atTime(day, 9, 0);
      const clockOut = atTime(day, 18, 0);
      const totalBreakSeconds = 30 * 60;
      const totalWorkSeconds = Math.floor((clockOut.getTime() - clockIn.getTime()) / 1000) - totalBreakSeconds;

      const attendance = await prisma.attendance.upsert({
        where: { userId_attendanceDate: { userId: user.id, attendanceDate: new Date(`${day}T00:00:00.000Z`) } },
        update: {},
        create: {
          userId: user.id,
          attendanceDate: new Date(`${day}T00:00:00.000Z`),
          clockIn,
          clockOut,
          status: AttendanceStatus.CLOCKED_OUT,
          totalBreakSeconds,
          totalWorkSeconds,
        },
      });

      await prisma.break.deleteMany({ where: { attendanceId: attendance.id } });
      await prisma.break.create({
        data: {
          attendanceId: attendance.id,
          startedAt: atTime(day, 13, 0),
          endedAt: atTime(day, 13, 30),
          durationSeconds: 30 * 60,
        },
      });
    }
  }

  console.log("Seeded sample historical attendance records (last 4 days) for demo purposes.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
