function normalize(input: string, separator: '-' | '_'): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, separator)
    .replace(new RegExp(`^\\${separator}+|\\${separator}+$`, 'g'), '');
}

/** URL slug for tables: `Client Accounts` → `client-accounts`. */
export function toSlug(name: string): string {
  return normalize(name, '-').slice(0, 64) || 'table';
}

/** Machine key for columns: `First Name` → `first_name`. */
export function toColumnKey(name: string): string {
  const key = normalize(name, '_').slice(0, 60);
  if (!key) return 'column';
  return /^[a-z]/.test(key) ? key : `c_${key}`;
}

/** Appends -2, -3… (or _2, _3…) until `isTaken` returns false. */
export async function uniquify(
  base: string,
  separator: '-' | '_',
  isTaken: (candidate: string) => boolean | Promise<boolean>,
): Promise<string> {
  let candidate = base;
  for (let n = 2; await isTaken(candidate); n++) {
    candidate = `${base}${separator}${n}`;
  }
  return candidate;
}
