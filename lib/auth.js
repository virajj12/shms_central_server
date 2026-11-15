import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

export const SECRET_KEY = process.env.SHMS_SECRET_KEY || 'shms-enterprise-central-secret-key-2026-v1';
export const SESSION_COOKIE_NAME = 'shms_central_session';
export const TOKEN_HASH_PREFIX = 'hmac_sha256$';

/**
 * Returns an HMAC-SHA256 hash for an edge authentication token.
 */
export function hashEdgeToken(token) {
  if (!token) return '';
  const digest = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(String(token))
    .digest('hex');
  return `${TOKEN_HASH_PREFIX}${digest}`;
}

/**
 * Compares an incoming plain edge token against the stored hash.
 */
export function verifyEdgeTokenHash(rawToken, storedHash) {
  if (!rawToken || !storedHash) return false;
  // If stored hash was raw (legacy)
  if (!storedHash.startsWith(TOKEN_HASH_PREFIX)) {
    return rawToken === storedHash;
  }
  const computed = hashEdgeToken(rawToken);
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(storedHash));
  } catch {
    return false;
  }
}

/**
 * Password hashing and verification
 */
export async function hashPassword(plain) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
}

export async function verifyPassword(plain, hashed) {
  if (!plain || !hashed) return false;
  try {
    return await bcrypt.compare(plain, hashed);
  } catch {
    return false;
  }
}

/**
 * JWT Session management
 */
export function createSessionToken(user, expiresIn = '24h') {
  return jwt.sign(
    {
      sub: user.username,
      id: user.id,
      role: user.role || 'superadmin',
      owner_id: user.owner_id || 'OWN-DEFAULT-SYSTEM',
      is_superadmin: Boolean(user.is_superadmin),
    },
    SECRET_KEY,
    { expiresIn }
  );
}

export function verifySessionToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, SECRET_KEY);
  } catch {
    return null;
  }
}

/**
 * Express middleware to protect admin endpoints
 */
export function requireAdmin(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE_NAME] ||
    (req.headers.authorization && req.headers.authorization.replace('Bearer ', ''));

  if (!token) {
    return res.status(401).json({ detail: 'Authentication required. Please log in.' });
  }

  const payload = verifySessionToken(token);
  if (!payload) {
    return res.status(401).json({ detail: 'Session expired or invalid. Please log in again.' });
  }

  req.user = payload;
  next();
}
