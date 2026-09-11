// Required imports
import express from "express";

// File Imports
import { 
    PORT,
} from "./config/injection/env.js";
import connectToDatabase from "./database/mongodb.js";

// All routes
import authRouter from "./routes/auth.routes.js";
import userRouter from "./routes/user.routes.js";

// Built-in Middlewares
import cookieParser from 'cookie-parser';

// Custom Middlewares
import errorMiddleware from "./middlewares/error.middleware.js";

const server = express();

server.use(express.json());
server.use(express.urlencoded({ extended: false }));
server.use(cookieParser());

server.use('/api/v1/auth', authRouter);
server.use('/api/v1/users', userRouter);

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
