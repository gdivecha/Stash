import { Router } from "express";
import {
    createVaultItem,
    getVaultItems,
} from '../controllers/vault.controller.js';
import authorize from '../middlewares/auth.middleware.js';

const vaultRouter = Router();

vaultRouter.use(authorize);

// This line of code groups multiple HTTP 
// request methods for the exact same route path ('/') into a single, chained statement.
// vaultRouter.route('/').post(createVaultItem).get(getVaultItems);

// But I'll do it the normal, more readable way:

vaultRouter.get('/', getVaultItems);
vaultRouter.post('/', createVaultItem);

export default vaultRouter;
