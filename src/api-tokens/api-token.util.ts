import { createHash, randomBytes } from 'node:crypto';

export const TOKEN_PREFIX = 'phr_';
const TOKEN_PATTERN = /^phr_[A-Za-z0-9_-]{43}$/;

/** 32 random bytes → `phr_` + 43 base64url chars. */
export function generateApiToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString('base64url');
}

export function hashApiToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function isWellFormedToken(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

/** Non-secret leading characters, shown in the UI to identify a token. */
export function displayPrefix(token: string): string {
  return token.slice(0, TOKEN_PREFIX.length + 8);
}
