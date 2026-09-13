import { Router } from "express";
import {
    createVaultItem,
    getVaultItems,
    deleteVaultItem,
    getVaultSummary,
} from '../controllers/vault.controller.js';
import authorize from '../middlewares/auth.middleware.js';
import { 
    validate, 
    vaultItemSchema,
    vaultParamSchema,
    vaultDeleteParamSchema
} from '../middlewares/validation.middleware.js';

const vaultRouter = Router();

vaultRouter.use(authorize);

vaultRouter.get('/pull/:type/:workspace', validate(vaultParamSchema, 'params'), getVaultItems);
vaultRouter.post('/push', validate(vaultItemSchema, 'body'), createVaultItem);
vaultRouter.delete('/:type/:workspace', validate(vaultDeleteParamSchema, 'params'), deleteVaultItem);
vaultRouter.get('/summary', getVaultSummary);

export default vaultRouter;