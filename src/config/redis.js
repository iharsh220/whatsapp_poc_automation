require('dotenv').config();

const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  retryStrategy: (times) => {
    if (times > 10) {
      console.error('Redis connection failed after 10 retries');
      return null;
    }
    return Math.min(times * 200, 2000);
  },
  maxRetriesPerRequest: null,
});

redis.on('error', (err) => console.error('Redis error:', err.message));

module.exports = redis;
