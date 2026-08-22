import { describe, expect, it } from 'vitest';
import { hasPermission } from './permissions.js';

describe('hasPermission', () => {
  it('grants owner both read and write on companies', () => {
    expect(hasPermission('owner', 'companies.read')).toBe(true);
    expect(hasPermission('owner', 'companies.write')).toBe(true);
  });

  it('grants admin both read and write on companies', () => {
    expect(hasPermission('admin', 'companies.read')).toBe(true);
    expect(hasPermission('admin', 'companies.write')).toBe(true);
  });

  it('grants member read but not write on companies', () => {
    expect(hasPermission('member', 'companies.read')).toBe(true);
    expect(hasPermission('member', 'companies.write')).toBe(false);
  });
});
