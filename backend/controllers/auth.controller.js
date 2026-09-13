// 3. Auth Controller (backend/controllers/auth.controller.js)
import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';
import dayjs from 'dayjs';
import {
    JWT_EXPIRES_IN,
    JWT_SECRET,
    NODE_ENV,
} from '../../env.js';
import { blacklistToken } from '../providers/upstash.js';

const signToken = (userId) => {
    return jwt.sign(
        { userId },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN },
    )
};

const sentTokenCookie = (user, statusCode, res) => {
    const token = signToken(user._id);
    const cookieOptions = {
        expires: dayjs().add(7, 'days').toDate(),
        httpOnly: true,
        secure: NODE_ENV === 'production',
        sameSite: 'strict',
    };

    res.cookie('token', token, cookieOptions);
    user.password = undefined;

    res.status(statusCode).json({
        status: 'success',
        data: {
            user,
        },
    });
};

export const signUp = async (req, res, next) => {
    try {
        const {
            name,
            email,
            password
        } = req.body;
        
        const newUser = await User.create({
            name,
            email,
            password,
        });

        sentTokenCookie(
            newUser,
            201,
            res,
        );
    } catch (error) {
        next(error);
    }
};

export const signIn = async (req, res, next) => {
    try {
        const {
            email,
            password
        } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({
                message: 'Please provide email and password',
            });
        }

        const user = await User.findOne({ email }).select('+password');

        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({
                message: 'Invalid email or password',
            });
        }
        
        sentTokenCookie(
            user,
            200,
            res,
        );
    } catch (error) {
        next(error);
    }
};

export const signOut = async (req, res, next) => {
    try {
        const token = req.token; // Captured from authorize middleware

        if (token && token !== 'loggedout') {
            const decoded = jwt.decode(token);
            if (decoded && decoded.exp) {
                const now = Math.floor(Date.now() / 1000);
                const ttl = decoded.exp - now;

                if (ttl > 0) {
                    await blacklistToken(token, ttl);
                }
            }
        }

        res.cookie(
            'token',
            'loggedout',
            {
                expires: dayjs().add(10, 'seconds').toDate(),
                httpOnly: true,
            },
        );
        res.status(200).json({
            status: 'success',
            message: 'Logged out successfully',
        });
    } catch (error) {
        next(error);
    }
};
