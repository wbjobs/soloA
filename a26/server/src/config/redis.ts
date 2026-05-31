import Redis from 'ioredis';
import config from './env';

const redis = new Redis(config.redisUrl);
const redisPub = new Redis(config.redisUrl);
const redisSub = new Redis(config.redisUrl);

export { redis, redisPub, redisSub };
export default redis;
