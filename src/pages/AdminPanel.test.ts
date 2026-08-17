import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.resolve(__dirname, './AdminPanel.tsx'), 'utf-8');

describe('AdminPanel source', () => {
  it('does not hardcode a plaintext admin password', () => {
    expect(source).not.toMatch(/ADMIN_PASSWORD\s*=\s*["']/);
  });

  it('does not compare submitted password against a literal string before calling Supabase', () => {
    expect(source).not.toMatch(/password\s*!==\s*ADMIN_PASSWORD/);
  });
});
