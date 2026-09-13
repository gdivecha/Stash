import { z } from 'zod';

/**
 * So far, the Mongoose setup for each schema check is good but:
 * The reason Zod is still added as a separate layer at the route entry point 
 * comes down to where and when validation happens:
 * - Mongoose validation runs at the database persistence layer: It checks data right 
 *   before it gets written via .save() or .create().
 * - Zod validation runs at the HTTP perimeter layer: It checks incoming JSON payloads
 *   before your controllers execute and before any database query is touched.
 * 
 * Why even use both then:
 * - Stopping Queries Before the DB: Mongoose schema validation rules do not automatically apply to query filters. If an 
 *   attacker passes an object with a NoSQL operator instead of a string, it hits the database query directly unless caught beforehand.
 * - Fail-Fast Performance: Picks up ont he issue fast
 * - Strict Payload Boundaries: Zod is a hard contract for API endpoints, ensuring clients can't smuggle unexpected propery keys
 */

export const registerUserSchema = z.object({
    name: z.string()
        .min(2, 'Name must be at least 2 characters long')
        .max(64, 'Name cannot exceed 64 characters')
        .regex(/^[a-zA-Z\s'-]+$/, 'Name can only contain alphabetic characters, spaces, hyphens, and apostrophes.'),
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

export const vaultItemSchema = z.object({
    schemaVersion: z.string().max(16, 'Schema version cannot exceed 16 characters').default('1.0.0'),
    payload: z.object({
        ciphertext: z.string().max(10485760, 'Ciphertext payload exceeds 10MB limit'),
        iv: z.string().max(64, 'IV string exceeds maximum length'),
        authTag: z.string().max(64, 'Auth tag exceeds maximum length'),
        salt: z.string().max(128, 'Salt exceeds maximum length'),
    }),
    metadata: z.object({
        payloadType: z.enum(['declarative_state', 'dotfiles', 'workspace_session', 'hybrid']).default('declarative_state'),
        workspaceName: z.string()
            .min(2)
            .max(64)
            .regex(/^[a-z0-9-_]+$/, 'Workspace name can only contain lowercase alphanumeric characters, hyphens, and underscores.')
            .toLowerCase(),
        device: z.object({
            deviceId: z.string().max(128).regex(/^[a-zA-Z0-9-_.:]*$/, 'Invalid characters in deviceId').nullable().optional(),
            hostname: z.string().max(255).regex(/^[a-zA-Z0-9-._]*$/, 'Invalid characters in hostname').nullable().optional(),
            platform: z.enum([null, 'darwin', 'linux', 'win32', 'freebsd', 'openbsd', 'sunos']).nullable().optional(),
            arch: z.enum([null, 'x64', 'arm64', 'arm', 'ia32', 'mips', 'mipsel', 'ppc64', 's390x']).nullable().optional(),
        }).optional(),
        itemCount: z.number().int().min(0).max(1000000).default(0),
    }),
});

export const vaultParamSchema = z.object({
    type: z.enum(['declarative_state', 'dotfiles', 'workspace_session', 'hybrid']).default('declarative_state'),
    workspace: z.string()
        .min(2)
        .max(64)
        .regex(/^[a-z0-9-_]+$/, 'Workspace name can only contain lowercase alphanumeric characters, hyphens, and underscores.')
        .toLowerCase()
        .default('default'),
});

export const vaultDeleteParamSchema = z.object({
    type: z.enum(['workspace_session']),
    workspace: z.string()
        .min(2)
        .max(64)
        .regex(/^[a-z0-9-_]+$/, 'Workspace name can only contain lowercase alphanumeric characters, hyphens, and underscores.')
        .toLowerCase(),
});

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
        return res.status(400).json({
            error: 'Validation failed',
            details: error.issues.map(err => ({
                field: err.path.join('.'),
                message: err.message,
            })),
        });
    }
};
