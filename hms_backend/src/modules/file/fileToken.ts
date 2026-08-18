import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

// Short-lived, server-signed token that authorizes ONE file download via the app's content route
// (used when the storage provider can't mint native signed URLs). Carries tenant + file id, so the
// content route needs no session — and the tenant is never taken from client input.
type FileTokenClaims = { fid: string; tid: string; purpose: 'file-download' };

export function signFileToken(fileId: string, tenantId: string): string {
  const claims: FileTokenClaims = { fid: fileId, tid: tenantId, purpose: 'file-download' };
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, { expiresIn: '10m' });
}

export function verifyFileToken(token: string): FileTokenClaims {
  const claims = jwt.verify(token, env.JWT_ACCESS_SECRET) as FileTokenClaims & jwt.JwtPayload;
  if (claims.purpose !== 'file-download') throw new Error('Invalid token purpose');
  return claims;
}
