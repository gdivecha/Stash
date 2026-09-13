import { Router } from 'express';
import {
    signUp,
    signIn,
    signOut,
} from '../controllers/auth.controller.js';
import { 
    validate, 
    registerUserSchema, 
    loginUserSchema 
} from '../middlewares/validation.middleware.js';

const authRouter = Router();

authRouter.post('/sign-up', validate(registerUserSchema), signUp);
authRouter.post('/sign-in', validate(loginUserSchema), signIn);
authRouter.post('/sign-out', signOut);

export default authRouter;