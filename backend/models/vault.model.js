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
        maxlength: [
            16, 
            'Schema version cannot exceed 16 characters'
        ],
    },
    // Encrypted payload container (Server remains completely zero-knowledge)
    payload: {
        ciphertext: {
            type: String,
            required: true,
            maxlength: [
                10485760, 
                'Ciphertext payload exceeds maximum allowed size of 10MB'
            ], 
        },
        iv: {
            type: String,
            required: true,
            maxlength: [
                64, 
                'IV string exceeds maximum length'
            ], 
        },
        authTag: {
            type: String,
            required: true, // Crucial for AES-256-GCM authentication
            maxlength: [
                64, 
                'Auth tag string exceeds maximum length'
            ],
        },
        salt: {
            type: String,
            required: true, // Key derivation salt (PBKDF2/Argon2)
            maxlength: [
                128, 
                'Salt string exceeds maximum length'
            ], 
        },
    },
    // Unencrypted metadata for routing, Phase 3 device guards, and UI previews
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
         * The CLI explicitly sends 'default' for Phase 1 & 2 snapshots so you can only have singular snapshots for phases 1 and 2 
         * (Phase 1 being non-sensitive app extensions and so on, Phase 2 being dot files including sensitive info, and Phase 3 being
         * live session capture which would require much fine permission management), and custom names (e.g. 'auth-refactor') for Phase 3
         * workspace sessions
         */
        workspaceName: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            minlength: 2, 
            maxlength: 64, 
            match: [
                /^[a-z0-9-_]+$/, 
                'Workspace name can only contain lowercase alphanumeric characters, hyphens, and underscores.'
            ],
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
                default: null,
                maxlength: [
                    128, 
                    'Device ID exceeds maximum length'
                ], 
                match: [
                    /^[a-zA-Z0-9-_.:]*$/, 
                    'Invalid characters in deviceId'
                ],
            },
            // e.g. "Gauravs-MBP.local"
            hostname: { 
                type: String, 
                default: null,
                maxlength: [
                    255, 
                    'Hostname exceeds maximum length'
                ], 
                match: [
                    /^[a-zA-Z0-9-._]*$/, 
                    'Invalid characters in hostname'
                ],
            },
            // e.g. "darwin" (macOS) or "linux"
            platform: { 
                type: String, 
                default: null,
                maxlength: [
                    32, 
                    'Platform string too long'
                ],
                enum: [
                    null, 
                    'darwin', 
                    'linux', 
                    'win32', 
                    'freebsd', 
                    'openbsd', 
                    'sunos'
                ],
            },
            // e.g. "arm64" or "x64"
            arch: { 
                type: String, 
                default: null,
                maxlength: [
                    16, 
                    'Architecture string too long'
                ],
                enum: [
                    null, 
                    'x64', 
                    'arm64', 
                    'arm', 
                    'ia32', 
                    'mips', 
                    'mipsel', 
                    'ppc64', 
                    's390x'
                ],
            },
        },
        // Quick summary without decryption: Enables fast UI summaries (e.g., displaying "Last updated 2 hours ago • 14 packages stored") without forcing the client to pull the entire 
        // heavy encrypted payload down and decrypt it first since server cannot look inside ciphertext to count your packages
        itemCount: {
            type: Number,
            default: 0,
            min: [
                0, 
                'Item count cannot be negative'
            ], 
            max: [
                1000000, 
                'Item count exceeds realistic limits'
            ],
        },
    }
}, { timestamps: true });

// Primary Index: Enforces uniqueness per user + payloadType + workspaceName + deviceId 
// ONLY for declarative_state and dotfiles. Workspace sessions remain multi-record history.
vaultItemSchema.index(
    { 
        user: 1, 
        'metadata.payloadType': 1, 
        'metadata.workspaceName': 1,
        'metadata.device.deviceId': 1
    }, 
    { 
        unique: true,
        partialFilterExpression: { 
            'metadata.payloadType': { $in: ['declarative_state', 'dotfiles'] } 
        } 
    }
);

// Secondary Index: Powers fast listing queries sorted by most recent activity per device/type
vaultItemSchema.index({ 
    user: 1, 
    'metadata.payloadType': 1, 
    'metadata.device.deviceId': 1,
    updatedAt: -1 
});

const VaultItem = mongoose.model('VaultItem', vaultItemSchema);
export default VaultItem;
