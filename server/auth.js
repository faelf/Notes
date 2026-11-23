import crypto from 'node:crypto';
import { config } from './config.js';

export const SESSION_COOKIE_NAME = 'notes_session';

// Sliding-window brute-force limiter per bucket: 3 failed attempts -> 15-minute lockout
const attemptBuckets = new Map();
export const MAX_ATTEMPTS = 3;
export const WINDOW_MS = 15 * 60 * 1000;

// Server-side session revocation (invalidates old tokens on logout)
const revokedTokens = new Map(); // jti -> expSec
let revokedBeforeMs = 0;

function pruneRevokedTokens() {
  const nowSec = Math.floor(Date.now() / 1000);
  for (const [jti, exp] of revokedTokens.entries()) {
    if (exp <= nowSec) {
      revokedTokens.delete(jti);
    }
  }
}

export function getClientIp(req) {
  const cfIp = req.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp.trim()) {
    return cfIp.trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

export function checkRateLimit(bucketKey) {
  const now = Date.now();
  const entry = attemptBuckets.get(bucketKey);
  if (!entry) return { allowed: true };

  const recent = entry.filter((ts) => now - ts < WINDOW_MS);
  if (recent.length === 0) {
    attemptBuckets.delete(bucketKey);
    return { allowed: true };
  }
  attemptBuckets.set(bucketKey, recent);

  if (recent.length >= MAX_ATTEMPTS) {
    const oldest = recent[0];
    const retryAfterSec = Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000));
    return { allowed: false, retryAfterSec };
  }
  return { allowed: true };
}

export function recordFailedAttempt(bucketKey) {
  const now = Date.now();
  const recent = (attemptBuckets.get(bucketKey) || []).filter((ts) => now - ts < WINDOW_MS);
  recent.push(now);
  attemptBuckets.set(bucketKey, recent);
  return recent.length;
}

export function clearFailedAttempts(bucketKey) {
  attemptBuckets.delete(bucketKey);
}

function timingSafeStringEqual(a, b) {
  const digestA = crypto.createHash('sha256').update(String(a)).digest();
  const digestB = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

export function verifyPassword(password, storedHash = config.authPasswordHash) {
  const [, salt, hashHex] = storedHash.split('$');
  const expectedBuf = Buffer.from(hashHex, 'hex');
  const derivedBuf = crypto.scryptSync(String(password), salt, expectedBuf.length);
  if (derivedBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(derivedBuf, expectedBuf);
}

/**
 * Derive session signing key from SESSION_SECRET and the active password hash.
 * Whenever the password changes, all previously issued sessions become invalid immediately.
 */
function getSigningKey() {
  return crypto
    .createHmac('sha256', config.sessionSecret)
    .update(config.authPasswordHash)
    .digest();
}

function signToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSigningKey())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return null;

  const encoded = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  if (!sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', getSigningKey())
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    const nowSec = Math.floor(Date.now() / 1000);
    if (!payload || typeof payload.exp !== 'number' || payload.exp <= nowSec) {
      return null;
    }
    if (typeof payload.iatMs !== 'number' || payload.iatMs <= revokedBeforeMs) {
      return null;
    }
    if (typeof payload.jti === 'string' && revokedTokens.has(payload.jti)) {
      return null;
    }
    if (!timingSafeStringEqual(payload.u || '', config.authUsername)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function shouldUseSecureCookie(req) {
  if (config.cookieSecureMode === 'true') return true;
  if (config.cookieSecureMode === 'false') return false;
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return Boolean(req.secure || forwardedProto === 'https');
}

export function issueSessionCookie(
  req,
  res,
  { username = config.authUsername, rememberMe = true } = {}
) {
  const ttlDays = rememberMe ? Math.max(30, config.sessionTtlDays) : config.sessionTtlDays;
  const ttlSec = ttlDays * 24 * 60 * 60;
  const iatMs = Math.max(Date.now(), revokedBeforeMs + 1);
  const nowSec = Math.floor(iatMs / 1000);

  const token = signToken({
    u: username,
    iat: nowSec,
    iatMs,
    exp: nowSec + ttlSec,
    jti: crypto.randomBytes(12).toString('hex'),
  });

  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: shouldUseSecureCookie(req),
    maxAge: ttlSec * 1000,
    path: '/',
  });
}

export function revokeAllSessions(currentSession = null) {
  if (currentSession?.jti && typeof currentSession.exp === 'number') {
    revokedTokens.set(currentSession.jti, currentSession.exp);
  }
  revokedBeforeMs = Math.max(revokedBeforeMs, Date.now());
  pruneRevokedTokens();
}

export function getSessionFromRequest(req) {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  return verifyToken(token);
}

export function requireAuth(req, res, next) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.user = { username: session.u };
  return next();
}

export function registerAuthRoutes(app) {
  app.get('/api/auth/status', (req, res) => {
    const session = getSessionFromRequest(req);
    if (!session) {
      return res.json({ authenticated: false });
    }
    return res.json({ authenticated: true, username: session.u });
  });

  app.post('/api/auth/login', (req, res) => {
    const ip = getClientIp(req);
    const limit = checkRateLimit(ip);
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSec));
      return res.status(429).json({
        error: `Too many failed login attempts. Please wait ${Math.ceil(
          limit.retryAfterSec / 60
        )} minute(s).`,
      });
    }

    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const rememberMe = Boolean(req.body?.rememberMe);

    const userOk = timingSafeStringEqual(username, config.authUsername);
    const passOk = verifyPassword(password, config.authPasswordHash);

    if (!userOk || !passOk) {
      const attemptsUsed = recordFailedAttempt(ip);
      const remaining = MAX_ATTEMPTS - attemptsUsed;
      if (remaining <= 0) {
        const retryAfterSec = Math.ceil(WINDOW_MS / 1000);
        res.setHeader('Retry-After', String(retryAfterSec));
        return res.status(429).json({
          error: `Too many failed login attempts. Locked for ${Math.ceil(
            WINDOW_MS / 60000
          )} minutes.`,
        });
      }
      return res.status(401).json({
        error: `Invalid username or password. ${remaining} ${
          remaining === 1 ? 'attempt' : 'attempts'
        } remaining.`,
      });
    }

    clearFailedAttempts(ip);
    issueSessionCookie(req, res, { username: config.authUsername, rememberMe });

    return res.json({ ok: true, username: config.authUsername });
  });

  app.post('/api/auth/logout', (req, res) => {
    const session = getSessionFromRequest(req);
    revokeAllSessions(session);

    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'lax',
      secure: shouldUseSecureCookie(req),
      path: '/',
    });
    return res.json({ ok: true });
  });
}
