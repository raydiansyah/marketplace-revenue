export interface PasswordPolicyResult {
  isValid: boolean;
  errors: string[];
  checks: {
    minLength: boolean;
    maxLength: boolean;
    hasLower: boolean;
    hasUpper: boolean;
    hasNumber: boolean;
    hasSymbol: boolean;
    notCommon: boolean;
  };
}

const COMMON_PASSWORDS = new Set(
  [
    "password",
    "password123",
    "12345678",
    "123456789",
    "qwerty123",
    "admin123",
    "welcome123",
    "letmein123",
    "iloveyou",
    "rahasia123",
  ].map((item) => item.toLowerCase())
);

export const PASSWORD_POLICY = {
  minLength: 12,
  // bcrypt hashes only first 72 bytes, so we enforce hard cap by bytes.
  maxBytes: 72,
};

function byteLength(input: string): number {
  return new TextEncoder().encode(input).length;
}

export function validateStrongPassword(password: string): PasswordPolicyResult {
  const value = String(password ?? "");
  const checks = {
    minLength: value.length >= PASSWORD_POLICY.minLength,
    maxLength: byteLength(value) <= PASSWORD_POLICY.maxBytes,
    hasLower: /[a-z]/.test(value),
    hasUpper: /[A-Z]/.test(value),
    hasNumber: /\d/.test(value),
    hasSymbol: /[^a-zA-Z0-9\s]/.test(value),
    notCommon: !COMMON_PASSWORDS.has(value.toLowerCase()),
  };

  const errors: string[] = [];
  if (!checks.minLength) errors.push(`Password minimal ${PASSWORD_POLICY.minLength} karakter.`);
  if (!checks.maxLength) errors.push("Password terlalu panjang untuk diproses aman.");
  if (!checks.hasLower) errors.push("Gunakan minimal 1 huruf kecil.");
  if (!checks.hasUpper) errors.push("Gunakan minimal 1 huruf besar.");
  if (!checks.hasNumber) errors.push("Gunakan minimal 1 angka.");
  if (!checks.hasSymbol) errors.push("Gunakan minimal 1 simbol.");
  if (!checks.notCommon) errors.push("Password terlalu umum, gunakan kombinasi yang lebih unik.");

  return {
    isValid: errors.length === 0,
    errors,
    checks,
  };
}
