import { NextFunction, Request, Response } from "express";
import { SESSION_COOKIE_NAME, SessionPayload, verifySession } from "../lib/auth";
import { fail } from "../lib/api-response";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (!token) {
    return fail(res, 401, "You must be logged in to perform this action.");
  }

  const payload = verifySession(token);
  if (!payload) {
    return fail(res, 401, "Your session has expired. Please log in again.");
  }

  req.user = payload;
  return next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return fail(res, 401, "You must be logged in to perform this action.");
  }
  if (req.user.role !== "ADMIN") {
    return fail(res, 403, "You do not have permission to access this resource.");
  }
  return next();
}
