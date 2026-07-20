import { Request } from 'express';

// Real visitor IP. The app is fronted by Cloudflare on the custom domain
// (fit2dive.bimboapp.com), which sets CF-Connecting-IP to the true client IP.
// Without this, Express's req.ip resolves to a Cloudflare/Railway proxy address,
// which would make rate limiting group all users together and pollute IP logs.
// Falls back to req.ip for direct (non-Cloudflare) access, e.g. the raw
// *.railway.app origin, where trust-proxy handling already yields the right IP.
export function getClientIp(req: Request): string {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.trim()) return cf.trim();
  return req.ip || '';
}
