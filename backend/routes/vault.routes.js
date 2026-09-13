import { Router } from "express";
import {
    createVaultItem,
    getVaultItems,
    getVaultSummary,
} from '../controllers/vault.controller.js';
import authorize from '../middlewares/auth.middleware.js';
import { 
    validate, 
    vaultItemSchema 
} from '../middlewares/validation.middleware.js';

const vaultRouter = Router();

vaultRouter.use(authorize);

// This line of code groups multiple HTTP 
// request methods for the exact same route path ('/') into a single, chained statement.
// vaultRouter.route('/').post(createVaultItem).get(getVaultItems);

// But I'll do it the normal, more readable way:

vaultRouter.get('/pull', getVaultItems);
vaultRouter.post('/push', validate(vaultItemSchema), createVaultItem);
vaultRouter.get('/summary', getVaultSummary);

export default vaultRouter;