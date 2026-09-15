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
        const deviceId = metadata.device?.deviceId;

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

        // If a deviceId is present, scope the upsert filter to that specific device
        if (deviceId) {
            filter['metadata.device.deviceId'] = deviceId;
        } else {
            filter['metadata.device.deviceId'] = null;
        }

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

        const item = await VaultItem.findOneAndUpdate(filter, update, options);

        res.status(200).json({
            success: true,
            message: `Snapshot '${item.metadata.workspaceName}' synced successfully for device [${deviceId || 'unknown'}].`,
            data: { item },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Pull / Fetch a specific encrypted snapshot for CLI restore or viewing
 * @route   GET /api/v1/vault/pull/:type/:workspace?deviceId=... (Example URL)
 * @access  Private
 */
export const getVaultItems = async (req, res, next) => {
    try {
        const userId = req.user._id;
        // Zod validation middleware has already sanitized and parsed req.params
        const { type: payloadType, workspace: workspaceName } = req.params;
        const { deviceId } = req.query; // Optional device filter

        const query = {
            user: userId,
            'metadata.payloadType': payloadType,
            'metadata.workspaceName': workspaceName,
        };

        if (deviceId) {
            query['metadata.device.deviceId'] = deviceId;
        }

        // If no deviceId is provided, sort by newest update to grab the latest across any device
        const vaultItem = await VaultItem.findOne(query).sort({ updatedAt: -1 });

        if (!vaultItem) {
            return res.status(404).json({
                success: false,
                message: `No vault snapshot found for type '${payloadType}' in workspace '${workspaceName}'${deviceId ? ` on device [${deviceId}]` : ''}.`,
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
        const { deviceId } = req.query;

        const query = {
            user: userId,
            'metadata.payloadType': payloadType,
            'metadata.workspaceName': workspaceName,
        };

        if (deviceId) {
            query['metadata.device.deviceId'] = deviceId;
        }

        const deletedItem = await VaultItem.findOneAndDelete(query);

        if (!deletedItem) {
            return res.status(404).json({
                success: false,
                message: `No workspace session found for '${workspaceName}'${deviceId ? ` on device [${deviceId}]` : ''}.`,
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
 * @desc    Fetch lightweight multi-device summary across all modules for UI dashboard / CLI
 * @route   GET /api/v1/vault/summary
 * @access  Private
 */
export const getVaultSummary = async (req, res, next) => {
    try {
        const userId = req.user._id;

        // Fetch all lightweight records for the user excluding heavy encrypted payload
        const allItems = await VaultItem.find({ user: userId })
            .select('-payload')
            .sort({ updatedAt: -1 });

        const declarativeStateMap = {};
        const dotfilesMap = {};
        const workspaces = [];

        for (const item of allItems) {
            const type = item.metadata.payloadType;
            const deviceId = item.metadata.device?.deviceId || 'unknown-device';

            if (type === 'declarative_state') {
                if (!declarativeStateMap[deviceId]) {
                    declarativeStateMap[deviceId] = {
                        metadata: item.metadata,
                        updatedAt: item.updatedAt
                    };
                }
            } else if (type === 'dotfiles') {
                if (!dotfilesMap[deviceId]) {
                    dotfilesMap[deviceId] = {
                        metadata: item.metadata,
                        updatedAt: item.updatedAt
                    };
                }
            } else if (type === 'workspace_session') {
                workspaces.push({
                    id: item._id,
                    workspaceName: item.metadata.workspaceName,
                    deviceId: deviceId,
                    metadata: item.metadata,
                    updatedAt: item.updatedAt,
                });
            }
        }

        res.status(200).json({
            success: true,
            data: {
                declarativeState: Object.keys(declarativeStateMap).length > 0 ? declarativeStateMap : null,
                dotfiles: Object.keys(dotfilesMap).length > 0 ? dotfilesMap : null,
                workspaces: workspaces,
            },
        });
    } catch (error) {
        next(error);
    }
};
