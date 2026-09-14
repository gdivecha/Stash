import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function scanGitConfigEnvironment() {
    try {
        const { stdout } = await execAsync('git config --global --list');
        const lines = stdout.split('\n').filter(Boolean);
        
        const config = {};
        const sensitiveKeys = ['signingkey', 'password', 'token', 'secret', 'credential'];

        for (const line of lines) {
            const index = line.indexOf('=');
            if (index === -1) continue;
            
            const key = line.substring(0, index).trim();
            const value = line.substring(index + 1).trim();

            // Exclude keys that might expose signing keys or auth tokens
            const isSensitive = sensitiveKeys.some(s => key.toLowerCase().includes(s));
            if (isSensitive) continue;

            config[key] = value;
        }

        const keysCount = Object.keys(config).length;

        return {
            available: true,
            config,
            breakdown: {
                settingsCount: keysCount,
            },
        };
    } catch (err) {
        return {
            available: false,
            error: 'Global git config is not available or git is uninstalled.',
            config: {},
            breakdown: { settingsCount: 0 },
        };
    }
}
