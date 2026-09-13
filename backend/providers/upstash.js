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
