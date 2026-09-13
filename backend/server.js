// Required imports
import express from "express";

// Security & Middleware Imports
import helmet from "helmet";
import cookieParser from 'cookie-parser';

// File Imports
import { 
    PORT,
} from "../providers/env.js";
import connectToDatabase from "./database/mongodb.js";

// All routes
import authRouter from "./routes/auth.routes.js";
import userRouter from "./routes/user.routes.js";
import vaultRouter from "./routes/vault.routes.js";

// Custom Middlewares
import errorMiddleware from "./middlewares/error.middleware.js";

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

// - Payload Size Restriction: Aligned with 10MB max ciphertext schema limit to block DoS attacks
// - If you change this, you'll have to update the schema as well
server.use(express.json({ limit: '10mb' }));
server.use(express.urlencoded({ extended: true, limit: '10mb' }));
server.use(cookieParser());

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

server.listen( PORT, async() => {
    console.log(`Stash API is running on http://localhost:${PORT}`);
    await connectToDatabase();
});

export default server;