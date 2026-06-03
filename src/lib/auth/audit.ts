/**
 * Module: Auth Audit Logger
 * Purpose: Insert login_events rows for audit trail
 * Used by: login route, logout route, /api/auth/refresh, middleware
 * Dependencies: loginEvents table (schema.ts)
 * Public functions: logAuthEvent()
 * Side effects: DB INSERT login_events (fire-and-forget, never throws)
 */

import { randomUUID } from "crypto";
import { getDb } from "@/lib/db/client";
import { loginEvents } from "@/lib/db/schema";

export type AuthEventType = "login" | "logout" | "refresh" | "failure";

/**
 * Fire-and-forget audit log insertion.
 * Callers must NOT await this if they want non-blocking behavior:
 *   logAuthEvent(...).catch(console.error)
 *
 * Internal errors are swallowed so a DB hiccup never breaks the auth flow.
 */
export async function logAuthEvent(
  userId: string,
  event: AuthEventType,
  ip: string,
  userAgent: string
): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(loginEvents).values({
      id: randomUUID(),
      userId,
      event,
      ip,
      userAgent,
    });
  } catch (err) {
    console.error("[audit] logAuthEvent failed:", err);
  }
}
