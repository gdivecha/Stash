import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({
    path: path.join(
        __dirname, 
        './', 
        `.env.${process.env.NODE_ENV || 'development'}.local`
    )
});

config();

export const { 
    NODE_ENV,
    BACKEND_PORT,
    BACKEND_SERVER_URL,
    BACKEND_API_VERSION,
    FRONTEND_PORT,
    FRONTEND_URL,
    MONGO_URI,
    JWT_SECRET,
    JWT_EXPIRES_IN,
    SESSION_TOKEN,
    UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN,
    STASH_PRIVATE_KEY,
    STASH_PUBLIC_KEY,
} = process.env;

if (!MONGO_URI) {
    throw new Error('FATAL: MONGO_URI environment variable is missing.');
}