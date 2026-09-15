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
    vaultDeleteParamSchema,
    vaultQuerySchema
} from '../middlewares/validation.middleware.js';

const vaultRouter = Router();

vaultRouter.use(authorize);

// Pull route: Validates both URL parameters and the optional ?deviceId= query parameter
vaultRouter.get(
    '/pull/:type/:workspace', 
    validate(vaultParamSchema, 'params'), 
    validate(vaultQuerySchema, 'query'), 
    getVaultItems
);

vaultRouter.post('/push', validate(vaultItemSchema, 'body'), createVaultItem);
vaultRouter.delete('/:type/:workspace', validate(vaultDeleteParamSchema, 'params'), deleteVaultItem);
vaultRouter.get('/summary', getVaultSummary);

export default vaultRouter;
