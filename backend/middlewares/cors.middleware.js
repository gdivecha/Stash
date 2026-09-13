import cors from 'cors';
import { 
    FRONTEND_URL,
} from '../../env.js';
import configFile from '../config.json' with { type: 'json' };

const corsConfig = configFile.cors || {};
const allowedOrigins = Array.isArray(corsConfig.allowedOrigins) 
    ? [...corsConfig.allowedOrigins] 
    : [];

if (FRONTEND_URL && !allowedOrigins.includes(FRONTEND_URL)) {
    allowedOrigins.push(FRONTEND_URL);
}

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like CLI tools, curl, or Postman)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) === -1) {
            return callback(new Error('CORS policy violation: This origin is not allowed.'), false);
        }
        return callback(null, true);
    },
    methods: corsConfig.allowedMethods || ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: corsConfig.allowedHeaders || ['Content-Type', 'Authorization'],
    credentials: true,
};

const corsMiddleware = cors(corsOptions);

export default corsMiddleware;