const buckets = new Map();
const dailyUsage = new Map();

function createRateLimiter({ windowMs = 60_000, max = 10, key = (req) => req.ip || 'unknown' } = {}) {
  return (req, res, next) => {
    const now = Date.now();
    const bucketKey = key(req);
    let bucket = buckets.get(bucketKey);
    if (!bucket || bucket.resetAt <= now) bucket = { count: 0, resetAt: now + windowMs };
    bucket.count += 1;
    buckets.set(bucketKey, bucket);
    if (bucket.count > max) {
      res.set('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ message: '请求太频繁，请稍后再试', code: 'RATE_LIMITED', retryable: true });
    }
    return next();
  };
}

function clearRateLimitBuckets() {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  const today = new Date().toISOString().slice(0, 10);
  for (const key of dailyUsage.keys()) if (!key.startsWith(today)) dailyUsage.delete(key);
}
setInterval(clearRateLimitBuckets, 60_000).unref();

module.exports = { createRateLimiter };

function consumeAiQuota(userId, feature) {
  const limits = { homework: Number(process.env.AI_HOMEWORK_DAILY_LIMIT || 30), report: Number(process.env.AI_REPORT_DAILY_LIMIT || 3), companion: Number(process.env.AI_COMPANION_DAILY_LIMIT || 60) };
  const today = new Date().toISOString().slice(0, 10);
  const key = `${today}:${userId}:${feature}`;
  const next = (dailyUsage.get(key) || 0) + 1;
  if (next > (limits[feature] || 30)) {
    const error = new Error('今天的 AI 使用次数已达到上限，请明天再试');
    error.status = 429; error.code = 'AI_DAILY_QUOTA_EXCEEDED'; error.retryable = true;
    throw error;
  }
  dailyUsage.set(key, next);
}

module.exports.consumeAiQuota = consumeAiQuota;
