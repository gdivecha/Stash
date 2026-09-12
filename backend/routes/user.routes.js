import { Router } from 'express';
import authorize from '../middlewares/auth.middleware.js';
import { 
    getUserProfile, 
    deleteUser, 
    updateUserInfo
} from '../controllers/user.controller.js';

const userRouter = Router();

userRouter.use(authorize);

userRouter.get('/me', getUserProfile);
userRouter.patch('/me', updateUserInfo);
userRouter.delete('/me', deleteUser);

export default userRouter;
