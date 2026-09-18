const redis = require('../config/redis');

const QUEUE_KEY = 'whatsapp:message:queue';
const RETRY_QUEUE_KEY = 'whatsapp:message:retry';
const DEDUP_KEY = 'whatsapp:message:queued';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3 * 60 * 60 * 1000; // 3 hours
const BLPOP_TIMEOUT = 10;

// ── Main Queue ── (FIFO list)

async function pushToQueue(messageData) {
  const dedupKey = `${messageData.doctorPhone || ''}:${messageData.type || ''}`;
  // Prevent duplicate queue entries from cron double-runs (e.g. server restart)
  const alreadyQueued = await redis.sismember(DEDUP_KEY, dedupKey);
  if (alreadyQueued) {
    console.log(`[dedup] skipping duplicate ${messageData.type} → ${messageData.to} (${messageData.doctorName})`);
    return false;
  }
  await redis.sadd(DEDUP_KEY, dedupKey);
  await redis.expire(DEDUP_KEY, 30); // 30s TTL — prevents double-sends, allows quick re-test
  await redis.rpush(QUEUE_KEY, JSON.stringify({ ...messageData, retryCount: 0 }));
  return true;
}

async function popFromQueue() {
  const data = await redis.blpop(QUEUE_KEY, BLPOP_TIMEOUT);
  if (!data) return null;
  const [, payload] = data;
  try { return JSON.parse(payload); } catch { return null; }
}

// ── Retry Queue ── (sorted set keyed by retry timestamp)

// Atomic pop — prevents race conditions when multiple workers run
const POP_RETRIES_LUA = `
  local items = redis.call('ZRANGEBYSCORE', KEYS[1], 0, ARGV[1], 'LIMIT', 0, ARGV[2])
  if #items == 0 then return {} end
  redis.call('ZREM', KEYS[1], unpack(items))
  return items
`;

async function popDueRetries(batchSize = 10) {
  const now = Date.now();
  const items = await redis.eval(POP_RETRIES_LUA, 1, RETRY_QUEUE_KEY, now, batchSize);
  if (!items || !items.length) return [];
  return items.map(i => JSON.parse(i));
}

async function pushToRetryQueue(messageData) {
  const retryAt = Date.now() + RETRY_DELAY_MS;
  const member = JSON.stringify(messageData);
  // NX prevents re-queuing the exact same message (idempotent retry)
  await redis.zadd(RETRY_QUEUE_KEY, 'NX', retryAt, member);
}

async function getQueueLength() {
  const [main, retry] = await Promise.all([
    redis.llen(QUEUE_KEY),
    redis.zcard(RETRY_QUEUE_KEY),
  ]);
  return { main, retry };
}

async function clearQueues() {
  await redis.del(QUEUE_KEY, RETRY_QUEUE_KEY, DEDUP_KEY);
}

module.exports = {
  pushToQueue,
  popFromQueue,
  popDueRetries,
  pushToRetryQueue,
  getQueueLength,
  clearQueues,
  MAX_RETRIES,
  RETRY_DELAY_MS,
};
