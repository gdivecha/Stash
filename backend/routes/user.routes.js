import { Router } from 'express';
import authorize from '../middlewares/auth.middleware.js';
import { 
    getUserProfile, 
    deleteUser, 
    updateUserInfo
} from '../controllers/user.controller.js';
import { 
    validate, 
    updateUserSchema 
} from '../middlewares/validation.middleware.js';

const userRouter = Router();

userRouter.use(authorize);

userRouter.get('/me', getUserProfile);
userRouter.patch('/me', validate(updateUserSchema), updateUserInfo);
userRouter.delete('/me', deleteUser);

export default userRouter;
