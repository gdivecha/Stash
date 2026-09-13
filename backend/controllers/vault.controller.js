import VaultItem from "../models/vault.model.js";

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
        /**
         * We set schemaVersion in the controller destructuring for two key reasons:
         * 1) schemaVersion = '1.0.0' uses JavaScript's default parameter assignment:
         *    - If an older CLI client or a basic script sends a request body without 
         *      explicitly specifying a schemaVersion (e.g., req.body only has { payload, metadata }), 
         *      JavaScript automatically sets schemaVersion to '1.0.0'. This prevents undefined from 
         *      being written into your database.
         * 2) Forward & Backward Compatibility (Database Contracts):
         *    - As Stash grows from Declarative State (declarative package lists) to Dotfiles and Active Workspaces, 
         *      how the client packages and encrypts data might evolve.
         *      - Preventing Client Crashes: User running an older version of CLI on a laptop but pulling a snapshot created by a newer CLI on another machine
         *      - Graceful Handling: By storing schemaVersion alongside the payload, the backend can return it to the client. The client CLI can inspect the version before 
         *        attempting to decrypt or parse the payload
         */ 
        const userId = req.user._id;
        const {
            payload,
            metadata,
            schemaVersion = '1.0.0',  
        } = req.body;
        
        // Validate nested payload fields required for AES-256-GCM
        if (!payload?.ciphertext 
            || !payload?.iv 
            || !payload?.authTag 
            || !payload?.salt) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required payload encryption fields (ciphertext, iv, authTag, salt).',
                });
        }

        // Validate and normalize metadata fields to match schema requirements
        if (!metadata 
            || !metadata.payloadType 
            || !metadata.workspaceName) {
            // Return if payloadType is missing instead of defaulting silently
            return res.status(400).json({
                success: false,
                error: 'Missing required metadata fields (payloadType, workspaceName).',
            });
        }

        // Upserting snapshot based on user + payloadType + workspaceName
        const filter = {
            user: userId,
            'metadata.payloadType': metadata.payloadType,
            'metadata.workspaceName': metadata.workspaceName.toLowerCase().trim(),
        };

        const update = {
            schemaVersion: schemaVersion || '1.0.0',
            payload,
            metadata: {
                ...metadata,
                workspaceName: metadata.workspaceName.toLowerCase().trim(),
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
 * @route   GET /api/v1/vault/pull?type=declarative_state&workspace=default (Example URL)
 * @access  Private
 */
export const getVaultItems = async (req, res, next) => {
    try {
        const userId = req.user._id;
        // Query by specific payloadType (defaulting to 'declarative_state')
        const payloadType = req.query.type || 'declarative_state';
        const workspaceName = (req.query.workspace || 'default').toLowerCase().trim();

        const vaultItem = await VaultItem.findOne({
            user: userId,
            'metadata.payloadType': payloadType,
            'metadata.workspaceName': workspaceName,
        });

        if (!vaultItem) {
            return res.status(404).json({
                success: false,
                error: `No vault snapshot found for type '${payloadType}' in workspace '${workspaceName}'.`,
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
 * @desc    Fetch lightweight summary across all modules for UI dashboard
 * @route   GET /api/v1/vault/summary
 * @access  Private
 */
export const getVaultSummary = async (req, res, next) => {
    try {
        const userId = req.user._id;

        // Query the latest snapshot for each module in parallel
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
