const redis = require('../config/redis');

const QUEUE_KEY = 'whatsapp:message:queue';
const RETRY_QUEUE_KEY = 'whatsapp:message:retry';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3 * 60 * 60 * 1000; // 3 hours

async function pushToQueue(messageData) {
  await redis.rpush(QUEUE_KEY, JSON.stringify({ ...messageData, retryCount: 0 }));
}

async function popFromQueue() {
  const data = await redis.lpop(QUEUE_KEY);
  return data ? JSON.parse(data) : null;
}

// Retry queue uses sorted set - score = timestamp when to retry
async function pushToRetryQueue(messageData) {
  const retryAt = Date.now() + RETRY_DELAY_MS;
  await redis.zadd(RETRY_QUEUE_KEY, retryAt, JSON.stringify(messageData));
}

// Pop messages from retry queue that are due
async function popDueRetries() {
  const now = Date.now();
  const items = await redis.zrangebyscore(RETRY_QUEUE_KEY, 0, now, 'LIMIT', 0, 10);
  if (!items.length) return [];

  await redis.zremrangebyscore(RETRY_QUEUE_KEY, 0, now);
  return items.map((i) => JSON.parse(i));
}

async function getQueueLength() {
  return redis.llen(QUEUE_KEY);
}

module.exports = { pushToQueue, popFromQueue, pushToRetryQueue, popDueRetries, getQueueLength, MAX_RETRIES };
