import { and, eq, gt, isNull } from "drizzle-orm";
import { randomBytes, createHash, randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { passwordResetTokens } from "@/lib/db/schema";

const RESET_TOKEN_TTL_MINUTES = 30;

function generateToken() {
  return randomBytes(32).toString("hex");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function nextId(): string {
  return randomUUID().replace(/-/g, "");
}

export async function ensurePasswordResetTable() {
  const db = await getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id VARCHAR(40) PRIMARY KEY,
      user_id VARCHAR(40) NOT NULL,
      token_hash VARCHAR(64) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_password_reset_user (user_id),
      INDEX idx_password_reset_token (token_hash),
      INDEX idx_password_reset_expires (expires_at)
    )
  `);
}

export async function createPasswordResetToken(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const db = await getDb();
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
  await db.insert(passwordResetTokens).values({
    id: nextId(),
    userId,
    tokenHash,
    expiresAt,
  });

  return { token, expiresAt };
}

export async function consumePasswordResetToken(token: string): Promise<{ userId: string } | null> {
  const db = await getDb();
  const tokenHash = hashToken(token);

  const [row] = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!row) return null;

  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, row.id));

  return { userId: row.userId };
}

