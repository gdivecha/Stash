// 1. Upstash Provider (backend/providers/upstash.js)
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { 
    UPSTASH_REDIS_REST_TOKEN, 
    UPSTASH_REDIS_REST_URL 
} from "../../env.js";
import configFile from '../config.json' with { type: 'json' };

export const redis = new Redis({
    url: UPSTASH_REDIS_REST_URL,
    token: UPSTASH_REDIS_REST_TOKEN,
});

export const ratelimit = new Ratelimit({
    redis: redis,
    limiter: Ratelimit.slidingWindow(
        configFile.rateLimit?.max || 100, 
        configFile.rateLimit?.window || "15 m"
    ),
    analytics: true,
    prefix: "stash:ratelimit",
});

/**
 * Add a token to the blacklist with an expiry matching its remaining life
 * @param {string} token - The raw JWT string
 * @param {number} ttlSeconds - Time-to-live in seconds until JWT naturally expires
 */
export const blacklistToken = async (token, ttlSeconds) => {
    await redis.set(`bl:${token}`, 'revoked', { ex: ttlSeconds });
};

/**
 * Check if a token has been revoked
 * @param {string} token - The raw JWT string
 * @returns {boolean} - True if blacklisted
 */
export const isTokenBlacklisted = async (token) => {
    const result = await redis.get(`bl:${token}`);
    return result !== null;
};
