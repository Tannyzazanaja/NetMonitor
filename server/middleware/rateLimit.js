/**
 * server/middleware/rateLimit.js
 * Centralized Rate Limiter for Login and Telemetry Queries
 *
 * Implements Section 10, 11, 15, and 46 of Master Development Prompt:
 * - Brute-force protection for login attempts
 * - Query throttling for TSDB/Prometheus/Analytics endpoints
 */

// Login Rate Limiter: Max 5 failed attempts per 5 minutes per IP
const loginAttemptsMap = new Map();
const LOGIN_RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5 minutes
const MAX_FAILED_LOGIN_ATTEMPTS = 5;

function getClientIp(req) {
  const forwarded = req.headers && req.headers['x-forwarded-for'];
  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

function checkLoginRateLimit(ip) {
  const now = Date.now();
  const record = loginAttemptsMap.get(ip);
  if (!record) return { allowed: true, remaining: MAX_FAILED_LOGIN_ATTEMPTS };

  if (now - record.firstAttemptTime > LOGIN_RATE_LIMIT_WINDOW) {
    loginAttemptsMap.delete(ip);
    return { allowed: true, remaining: MAX_FAILED_LOGIN_ATTEMPTS };
  }

  if (record.failedCount >= MAX_FAILED_LOGIN_ATTEMPTS) {
    const retryAfter = Math.ceil((record.firstAttemptTime + LOGIN_RATE_LIMIT_WINDOW - now) / 1000);
    return { allowed: false, retryAfter: Math.max(1, retryAfter) };
  }

  return { allowed: true, remaining: MAX_FAILED_LOGIN_ATTEMPTS - record.failedCount };
}

function recordFailedLogin(ip) {
  const now = Date.now();
  const record = loginAttemptsMap.get(ip);
  if (!record || (now - record.firstAttemptTime > LOGIN_RATE_LIMIT_WINDOW)) {
    loginAttemptsMap.set(ip, { failedCount: 1, firstAttemptTime: now });
  } else {
    record.failedCount += 1;
  }
}

function recordSuccessfulLogin(ip) {
  loginAttemptsMap.delete(ip);
}

// Telemetry & PromQL Query Rate Limiter: Max 60 queries per minute per IP
const queryRateLimitMap = new Map();
const QUERY_RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_QUERIES_PER_MINUTE = 60;

function checkQueryRateLimit(identifier) {
  const now = Date.now();
  const record = queryRateLimitMap.get(identifier);
  if (!record || (now - record.firstTime > QUERY_RATE_LIMIT_WINDOW)) {
    queryRateLimitMap.set(identifier, { count: 1, firstTime: now });
    return { allowed: true, remaining: MAX_QUERIES_PER_MINUTE - 1 };
  }
  if (record.count >= MAX_QUERIES_PER_MINUTE) {
    const retryAfter = Math.ceil((record.firstTime + QUERY_RATE_LIMIT_WINDOW - now) / 1000);
    return { allowed: false, retryAfter: Math.max(1, retryAfter) };
  }
  record.count += 1;
  return { allowed: true, remaining: MAX_QUERIES_PER_MINUTE - record.count };
}

module.exports = {
  getClientIp,
  checkLoginRateLimit,
  recordFailedLogin,
  recordSuccessfulLogin,
  loginAttemptsMap,
  checkQueryRateLimit,
  queryRateLimitMap
};
