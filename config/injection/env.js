import { config } from 'dotenv';
import path from 'path';

config({
    path: path.join(
        __dirname, 
        `.env.${process.env.NODE_ENV || 'development'}.local`
    )
});

config();

export const { 
    PORT,
    NODE_ENV,
    MONGO_URI,
    SERVER_URL,
} = process.env;

if (!MONGO_URI) {
    throw new Error('FATAL: MONGO_URI environment variable is missing.');
}
