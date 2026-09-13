import mongoose from "mongoose";

const vaultItemSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    // Engine/schema versioning for backend compatibility
    schemaVersion: {
        type: String,
        required: true,
        default: '1.0.0',
    },
    // Encrypted payload container (Server remains completely zero-knowledge)
    payload: {
        ciphertext: {
            type: String,
            required: true,
        },
        iv: {
            type: String,
            required: true,
        },
        authTag: {
            type: String,
            required: true, // Crucial for AES-256-GCM authentication
        },
        salt: {
            type: String,
            required: true, // Key derivation salt (PBKDF2/Argon2)
        },
    },
    // Unencrypted metadat for routing, Phase 3 device guards, and UI previews
    metadata: {
        payloadType: {
            type: String,
            enum: [
                'declarative_state', 
                'dotfiles', 
                'workspace_session', 
                'hybrid'
            ],
            default: 'declarative_state',
            required: true,
        },
        /**
         * The CLI explicitly sends 'default' for Phase 1 & 2 snapshots so you can only have singular snapshots for pahses 1 and 2 
         * (Phase 1 being non-sensitive app extensions and so on, Phase 2 being dot files including sensitive info, and Phase 3 being
         * live session capture which woudl require much fine permission managament), and custim names (e.g. 'auth-refactor') for Phase 3
         * workspace sessions
         */
        workspaceName: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
        },
        /**
         * - Why this matters:
         *   - In Phase 3 (or even multi-device Phase 1), when you run stash pull, the client sends its current OS and hostname.
         * - What this would enable:
         *   - Cross-OS Safety: If you try to restore a macOS backup onto an Ubuntu Linux machine, 
         *     the server (or client) can read platform: "darwin" and warn you: "Warning: 
         *     This backup was created on macOS. Homebrew casks will be skipped."
         *   - Device Awareness: It allows a web dashboard or CLI to show you a list of your devices 
         *     (e.g., "Work Laptop" vs. "Home Desktop") so you know which machine pushed the latest snapshot.
         */
        device: {
            // e.g. "macbook-pro-m2" (or a UUID)
            deviceId: { 
                type: String, 
                default: null 
            },
            // e.g. "Gauravs-MBP.local"
            hostname: { 
                type: String, 
                default: null 
            },
            // e.g. "darwin" (macOS) or "linux"
            platform: { 
                type: String, 
                default: null 
            },
            // e.g. "arm64" or "x64"
            arch: { 
                type: String, 
                default: null 
            },
        },
        // Quick summary without decryption: Enables fast UI summaries (e.g., displaying "Last updated 2 hours ago • 14 packages stored") without forcing the client to pull the entire 
        // heavy encrypted payload down and decrypt it first since server cannot look inside ciphertext to count your packages
        itemCount: {
            type: Number,
            default: 0,
        },
    }
}, { timestamps: true });

// Primary Index: Enforces database-level uniqueness per user + payloadType + workspaceName
vaultItemSchema.index(
    { 
        user: 1, 
        'metadata.payloadType': 1, 
        'metadata.workspaceName': 1 
    }, 
    { unique: true }
);

// Secondary Index: Powers fast listing queries sorted by most recent activity (e.g., stash context list)
// Compound index for fast queries when pulling a specific snapshot type per user
/**
 * - Databases slow down significantly as they grow if they have to scan every row to find a user's data.
 * - This creates a high-speed lookup shortcut in MongoDB. When you request your latest declarative_state snapshot, 
 *   MongoDB uses this index to jump directly to your user ID $\rightarrow$ the specific payload type $\rightarrow$ sorted by newest timestamp, returning the 
 *   exact snapshot in milliseconds
 */
vaultItemSchema.index({ 
    user: 1, 
    'metadata.payloadType': 1, 
    updatedAt: -1 
});

const VaultItem = mongoose.model('VaultItem', vaultItemSchema);
export default VaultItem;
