import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { signAuthToken, verifyAuthToken } from './tokens.js';

const SECRET = 'test-secret-value-that-is-long-enough';

describe('auth tokens', () => {
  it('round-trips a signed payload including sid', () => {
    const token = signAuthToken({ sub: 'user-1', email: 'a@b.com', isAdmin: true, sid: 'session-1' }, SECRET, '1h');
    const payload = verifyAuthToken(token, SECRET);
    expect(payload).toMatchObject({ sub: 'user-1', email: 'a@b.com', isAdmin: true, sid: 'session-1' });
  });

  it('rejects a token signed with a different secret', () => {
    const token = signAuthToken(
      { sub: 'user-1', email: 'a@b.com', isAdmin: false, sid: 'session-1' },
      'other-secret-value-that-is-long-enough',
      '1h'
    );
    expect(() => verifyAuthToken(token, SECRET)).toThrow();
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign({ sub: 'user-1', email: 'a@b.com', isAdmin: false, sid: 'session-1' }, SECRET, { expiresIn: -10 });
    expect(() => verifyAuthToken(expired, SECRET)).toThrow();
  });
});
