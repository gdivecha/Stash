import jwt from 'jsonwebtoken';
import {
    JWT_SECRET,
} from '../../env.js';
import User from '../models/user.model.js';
import { isTokenBlacklisted } from '../providers/upstash.js';

const authorize = async (req, res, next) => {
    try {
        let token;

        if (req.headers.authorization 
            && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        } 
        // Added cookie fallback to support browser clients alongside API testing tools
        else if (req.cookies && req.cookies.token) {
            token = req.cookies.token;
        }

        if (!token || token === 'loggedout') {
            return res.status(401).json({
                success: false, 
                message: 'Unauthorized',
            });
        }

        // Check if token is blacklisted in Upstash Redis
        const blacklisted = await isTokenBlacklisted(token);
        if (blacklisted) {
            return res.status(401).json({
                success: false,
                message: 'Token has been revoked. Please log in again.',
            });
        }

        const decoded = jwt.verify(
            token,
            JWT_SECRET,
        );

        const user = await User.findById(decoded.userId);

        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Unauthorized',
            });
        }

        req.user = user;
        req.token = token; // Store raw token reference for logout blacklisting
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized',
            error: error.message,
        });
    }
};

export default authorize;
