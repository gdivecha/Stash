// backend/controllers/vault.controller.js
import VaultItem from "../models/vault.model.js";
import configFile from '../config.json' with { type: 'json' };

/**
 * Push/Upsert Snapshot
 * Handles Declarative State sync (payLoadType = 'declarative_state' and workspaceName = 'default')
 * Future-proofing for dotfiles and active workspaces
 */ 

/**
 * @desc    Push / Upsert an encrypted snapshot (Declarative State, Dotfiles, or Active Workspaces)
 * @route   POST /api/v1/vault/push
 * @access  Private (Requires Authorize Middleware)
 */ 
export const createVaultItem = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const {
            payload,
            metadata,
            schemaVersion = '1.0.0',  
        } = req.body;

        const workspaceName = metadata.workspaceName.toLowerCase().trim();

        // Enforce maximum custom workspace limit per user to prevent index bloat/spam
        if (metadata.payloadType === 'workspace_session') {
            const existingWorkspaces = await VaultItem.distinct('metadata.workspaceName', { 
                user: userId, 
                'metadata.payloadType': 'workspace_session' 
            });

            const maxLimit = configFile.vault?.maxWorkspacesPerUser || 15;
            if (!existingWorkspaces.includes(workspaceName) && existingWorkspaces.length >= maxLimit) {
                return res.status(400).json({
                    success: false,
                    message: `Workspace limit reached. You can only create up to ${maxLimit} unique workspaces.`,
                });
            }
        }

        const filter = {
            user: userId,
            'metadata.payloadType': metadata.payloadType,
            'metadata.workspaceName': workspaceName,
        };

        const update = {
            schemaVersion: schemaVersion || '1.0.0',
            payload,
            metadata: {
                ...metadata,
                workspaceName,
            },
        };

        const options = {
            new: true,
            upsert: true,
            runValidators: true,
        };

        // Upsert: Update existing snapshot for this payloadType or create a new 
        /**
         * This single function call is the core sync operation for Stash's backend. Instead of creating a new 
         * database record every time a user backs up their machine, findOneAndUpdate performs an upsert 
         * (Update + Insert).
         * 
         * .... VaultItem.findOneAndUpdate() below has 3 parameters:
         * - filter: How to find the record -> uses user's id and payload type such as 'declarative_state'
         * - updateData: What data to write -> uses user's id, schema version, payload and metadata
         *   - Updates old encrypted payload with newly generated local encryption values
         *   - Captures cleartext metadata (device information and item counts) so the backend can serve
         *     metadata summaries without needing to decrypt the payload.
         * - options: How MongoDB should handle the operation -> here's how mongodb behaves:
         *   - upsert: Update if present, Insert if missing
         *   - new: Tells Mongoose to return the updated (new not old) document after the write finishes
         *   - runValidators: Forces MongoDB to validate the new data against your Mongoose VaultItemSchema rules 
         *     (ensuring required fields aren't missing or malformed) before saving
         */ 
        const item = await VaultItem.findOneAndUpdate(filter, update, options);

        res.status(200).json({
            success: true,
            message: `Snapshot '${item.metadata.workspaceName}' synced successfully.`,
            data: { item },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Pull / Fetch a specific encrypted snapshot for CLI restore or viewing
 * @route   GET /api/v1/vault/pull/:type/:workspace (Example URL)
 * @access  Private
 */
export const getVaultItems = async (req, res, next) => {
    try {
        const userId = req.user._id;
        // Zod validation middleware has already sanitized and parsed req.params
        const { type: payloadType, workspace: workspaceName } = req.params;

        const vaultItem = await VaultItem.findOne({
            user: userId,
            'metadata.payloadType': payloadType,
            'metadata.workspaceName': workspaceName,
        });

        if (!vaultItem) {
            return res.status(404).json({
                success: false,
                message: `No vault snapshot found for type '${payloadType}' in workspace '${workspaceName}'.`,
            });
        }

        res.status(200).json({
            success: true,
            data: vaultItem,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Delete a specific workspace session snapshot
 * @route   DELETE /api/v1/vault/:type/:workspace
 * @access  Private
 */ 
export const deleteVaultItem = async (req, res, next) => {
    try {
        const userId = req.user._id;
        // Zod path parameter validation middleware guarantees type is 'workspace_session' and parameters are sanitized
        const { type: payloadType, workspace: workspaceName } = req.params;

        const deletedItem = await VaultItem.findOneAndDelete({
            user: userId,
            'metadata.payloadType': payloadType,
            'metadata.workspaceName': workspaceName,
        });

        if (!deletedItem) {
            return res.status(404).json({
                success: false,
                message: `No workspace session found for '${workspaceName}'.`,
            });
        }

        res.status(200).json({
            success: true,
            message: `Workspace snapshot '${workspaceName}' deleted successfully.`,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Fetch lightweight summary across all modules for UI dashboard
 * @route   GET /api/v1/vault/summary
 * @access  Private
 */
export const getVaultSummary = async (req, res, next) => {
    try {
        const userId = req.user._id;

        const [declarativeState, dotfiles, workspaces] = await Promise.all([
            VaultItem.findOne({
                user: userId, 
                'metadata.payloadType': 'declarative_state'
            }).select('-payload').sort({ updatedAt: -1 }), // Exclude heavy encrypted ciphertext for fast loading
            VaultItem.findOne({
                user: userId, 
                'metadata.payloadType': 'dotfiles'
            }).select('-payload').sort({ updatedAt: -1 }),     
            VaultItem.find({
                user: userId, 
                'metadata.payloadType': 'workspace_session'
            }).select('-payload').sort({ updatedAt: -1 }),    
        ]);

        res.status(200).json({
            success: true,
            data: {
                declarativeState: declarativeState ? { 
                    metadata: declarativeState.metadata,
                    updatedAt: declarativeState.updatedAt
                } : null,
                dotfiles: dotfiles ? { 
                    metadata: dotfiles.metadata,
                    updatedAt: dotfiles.updatedAt
                } : null,
                workspaces: workspaces.map((session) => ({ 
                    id: session._id,
                    workspaceName: session.metadata.workspaceName,
                    metadata: session.metadata,
                    updatedAt: session.updatedAt,
                })),
            },
        });
    } catch (error) {
        next(error);
    }
};
