import { toColumnKey, toSlug, uniquify } from './slugify.js';

describe('slugify', () => {
  it('builds URL slugs', () => {
    expect(toSlug('Client Accounts (2026)')).toBe('client-accounts-2026');
    expect(toSlug('Café Ñandú')).toBe('cafe-nandu');
    expect(toSlug('!!!')).toBe('table');
  });

  it('builds column keys that start with a letter', () => {
    expect(toColumnKey('First Name')).toBe('first_name');
    expect(toColumnKey('2026 Revenue')).toBe('c_2026_revenue');
  });

  it('appends a counter until the value is free', async () => {
    const taken = new Set(['name', 'name_2']);
    await expect(uniquify('name', '_', (c) => taken.has(c))).resolves.toBe(
      'name_3',
    );
  });
});
