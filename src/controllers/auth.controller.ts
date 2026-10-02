import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { fail, ok } from "../lib/api-response";
import { loginSchema } from "../lib/validations";
import {
  SESSION_COOKIE_NAME,
  getSessionCookieOptions,
  signSession,
  verifyPassword,
} from "../lib/auth";
import { User } from "@prisma/client";

function toSafeUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
    location: user.location,
    employeeId: user.employeeId,
    avatar: user.avatar,
  };
}

export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 400, parsed.error.issues[0]?.message ?? "Invalid input.");
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return fail(res, 401, "Invalid email or password.");
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);
  if (!passwordMatches) {
    return fail(res, 401, "Invalid email or password.");
  }

  const token = signSession({ userId: user.id, role: user.role });
  res.cookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions());

  return ok(res, { user: toSafeUser(user) });
}

export async function logout(_req: Request, res: Response) {
  const options = getSessionCookieOptions();
  res.clearCookie(SESSION_COOKIE_NAME, { ...options, maxAge: undefined });
  return ok(res, { message: "Logged out." });
}

export async function me(req: Request, res: Response) {
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user) {
    return fail(res, 401, "Your session has expired. Please log in again.");
  }
  return ok(res, { user: toSafeUser(user) });
}
