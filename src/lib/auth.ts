import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is not set");
}

export interface SessionPayload {
  userId: string;
  role: "ADMIN" | "DEVELOPER";
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, JWT_SECRET as string, { expiresIn: SESSION_MAX_AGE_SECONDS });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET as string) as SessionPayload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = "hushlush_session";
export const SESSION_COOKIE_MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1000;

/**
 * Frontend and backend live on different origins in production (Vercel <-> Render), so the
 * session cookie must be SameSite=None; Secure to be sent cross-site. Locally, localhost:3000
 * and localhost:4000 are same-site (SameSite ignores port), so Lax without Secure works over http.
 */
export function getSessionCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: (isProduction ? "none" : "lax") as "none" | "lax",
    maxAge: SESSION_COOKIE_MAX_AGE_MS,
    path: "/",
  };
}
