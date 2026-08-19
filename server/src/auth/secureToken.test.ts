import { describe, expect, it } from 'vitest';
import { generateSecureToken, hashToken } from './secureToken.js';

describe('secureToken', () => {
  it('generates a 64-character hex token, different each call', () => {
    const a = generateSecureToken();
    const b = generateSecureToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it('hashes deterministically and differently per input', () => {
    const hash1 = hashToken('token-a');
    const hash2 = hashToken('token-a');
    const hash3 = hashToken('token-b');
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });
});
