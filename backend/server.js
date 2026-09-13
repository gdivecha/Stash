// Required imports
import express from "express";

// Security & Middleware Imports
import helmet from "helmet";
import cookieParser from 'cookie-parser';
import hpp from 'hpp';

// File Imports
import { 
    BACKEND_PORT,
} from "../env.js";
import connectToDatabase from "./database/mongodb.js";
import configFile from './config.json' with { type: 'json' };

// All routes
import authRouter from "./routes/auth.routes.js";
import userRouter from "./routes/user.routes.js";
import vaultRouter from "./routes/vault.routes.js";

// Custom Middlewares
import errorMiddleware from "./middlewares/error.middleware.js";
import rateLimitMiddleware from "./middlewares/rateLimit.middleware.js";
import corsMiddleware from './middlewares/cors.middleware.js';

const server = express();

/**
 * Helmet is a security middleware package that automatically configures various HTTP 
 * response headers to protect Express applications from common web vulnerabilities.
 * - Hides Technology Stack
 * - Prevents Clickjacking: Sets
 * - Mitigates XSS & Injection Attacks
 * - Enforces HTTPS (HSTS)
 * - Stops MIME-Sniffing
 */
server.use(helmet());

// Apply the modularized CORS configuration
server.use(corsMiddleware);


// - Payload Size Restriction: Aligned with 10MB max ciphertext schema limit to block DoS attacks
// Apply centralized payload caps from config.json
const payloadLimit = configFile.server?.payloadLimit || '10mb';
server.use(express.json({ limit: payloadLimit }));
server.use(express.urlencoded({ extended: true, limit: payloadLimit }));

// Protect against HTTP Parameter Pollution (HPP) attacks
server.use(hpp());

server.use(cookieParser());

server.use('/api/', rateLimitMiddleware);

server.use('/api/v1/auth', authRouter);
server.use('/api/v1/users', userRouter);
server.use('/api/v1/vault', vaultRouter);

server.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        engine: 'Stash',
    })
});

server.use(errorMiddleware);

server.listen( BACKEND_PORT, async() => {
    console.log(`Stash API is running on http://localhost:${BACKEND_PORT}`);
    await connectToDatabase();
});

export default server;