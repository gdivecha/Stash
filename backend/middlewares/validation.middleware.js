import { z } from 'zod';

/**
 * Zod Validation Layer vs Mongoose Schema Layer:
 * - Mongoose validation runs at the database persistence layer (.save / .create).
 * - Zod validation runs at the HTTP perimeter layer (middleware before controllers touch DB).
 * 
 * Benefits of two-tier validation:
 * - Defense in depth against NoSQL operator injection before queries execute.
 * - Fail-fast perimeter validation to reject invalid payloads early.
 * - Strict client-server contract enforcement to prevent parameter pollution.
 */

// Shared Schema Definitions & Enums
export const PAYLOAD_TYPES = ['declarative_state', 'dotfiles', 'workspace_session', 'hybrid'];
const payloadTypeEnum = z.enum(PAYLOAD_TYPES);

const workspaceNameSchema = z.string()
    .min(2, 'Workspace name must be at least 2 characters long')
    .max(64, 'Workspace name cannot exceed 64 characters')
    .regex(/^[a-z0-9-_]+$/, 'Workspace name can only contain lowercase alphanumeric characters, hyphens, and underscores.')
    .toLowerCase();

// User Authentication Schemas
export const registerUserSchema = z.object({
    name: z.string()
        .min(2, 'Name must be at least 2 characters long')
        .max(64, 'Name cannot exceed 64 characters')
        .regex(/^[a-zA-Z\s'-]+$/, "Name can only contain alphabetic characters, spaces, hyphens, and apostrophes."),
    email: z.string()
        .email('Please provide a valid email address')
        .max(254, 'Email cannot exceed 254 characters')
        .toLowerCase(),
    password: z.string()
        .min(8, 'Password must be at least 8 characters long')
        .max(1024, 'Password cannot exceed 1024 characters'),
});

export const loginUserSchema = z.object({
    email: z.string().email('Please provide a valid email address').toLowerCase(),
    password: z.string().min(1, 'Password is required'),
});

export const updateUserSchema = registerUserSchema.partial();

// Vault Schemas
export const vaultItemSchema = z.object({
    schemaVersion: z.string().max(16, 'Schema version cannot exceed 16 characters').default('1.0.0'),
    payload: z.object({
        ciphertext: z.string().max(10485760, 'Ciphertext payload exceeds 10MB limit'),
        iv: z.string().max(64, 'IV string exceeds maximum length'),
        authTag: z.string().max(64, 'Auth tag exceeds maximum length'),
        salt: z.string().max(128, 'Salt exceeds maximum length'),
    }),
    metadata: z.object({
        payloadType: payloadTypeEnum.default('declarative_state'),
        workspaceName: workspaceNameSchema,
        device: z.object({
            deviceId: z.string().max(128).regex(/^[a-zA-Z0-9-_.:]*$/, 'Invalid characters in deviceId').nullable().optional(),
            hostname: z.string().max(255).regex(/^[a-zA-Z0-9-._]*$/, 'Invalid characters in hostname').nullable().optional(),
            platform: z.enum(['darwin', 'linux', 'win32', 'freebsd', 'openbsd', 'sunos']).nullable().optional(),
            arch: z.enum(['x64', 'arm64', 'arm', 'ia32', 'mips', 'mipsel', 'ppc64', 's390x']).nullable().optional(),
        }).optional(),
        itemCount: z.number().int().min(0).max(1000000).default(0),
    }),
});

export const vaultParamSchema = z.object({
    type: payloadTypeEnum.default('declarative_state'),
    workspace: workspaceNameSchema.default('default'),
});

export const vaultDeleteParamSchema = z.object({
    type: payloadTypeEnum,
    workspace: workspaceNameSchema,
});

// Express Validation Middleware
export const validate = (schema, source = 'body') => async (req, res, next) => {
    try {
        if (source === 'query') {
            req.query = await schema.parseAsync(req.query);
        } else if (source === 'params') {
            req.params = await schema.parseAsync(req.params);
        } else {
            req.body = await schema.parseAsync(req.body);
        }
        next();
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                error: 'Validation failed',
                message: error.issues.map(err => `${err.path.join('.')}: ${err.message}`).join('; '),
                details: error.issues.map(err => ({
                    field: err.path.join('.'),
                    message: err.message,
                })),
            });
        }
        return res.status(500).json({ error: 'Internal server error during validation' });
    }
};
