import jwt from 'jsonwebtoken';

export interface AuthTokenPayload {
  sub: string;
  email: string;
  isAdmin: boolean;
  sid: string;
}

export function signAuthToken(payload: AuthTokenPayload, secret: string, expiresIn: string): string {
  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
}

export function verifyAuthToken(token: string, secret: string): AuthTokenPayload {
  return jwt.verify(token, secret) as AuthTokenPayload;
}
