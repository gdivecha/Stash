import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { 
    UPSTASH_REDIS_REST_TOKEN, 
    UPSTASH_REDIS_REST_URL 
} from "./env.js";

export const redis = new Redis({
    url: UPSTASH_REDIS_REST_URL,
    token: UPSTASH_REDIS_REST_TOKEN,
});

export const ratelimit = new Ratelimit({
    redis: redis,
    limiter: Ratelimit.slidingWindow(100, "15 m"),
    analytics: true,
    prefix: "stash:ratelimit",
});