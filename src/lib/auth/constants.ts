export const SUPERADMIN_EMAIL = (
  process.env.SUPERADMIN_EMAIL ?? "raydiansyah@gmail.com"
)
  .trim()
  .toLowerCase();

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isCanonicalSuperadminEmail(email: string): boolean {
  return normalizeEmail(email) === SUPERADMIN_EMAIL;
}
