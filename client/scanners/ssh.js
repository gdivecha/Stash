import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export async function scanSSHEnvironment() {
    const configPath = path.join(os.homedir(), '.ssh', 'config');
    const hosts = [];
    let available = false;

    try {
        const content = await fs.readFile(configPath, 'utf8');
        available = true;
        const lines = content.split('\n');

        let currentHost = null;

        for (let line of lines) {
            line = line.trim();
            if (!line || line.startsWith('#')) continue;

            const lower = line.toLowerCase();
            if (lower.startsWith('host ')) {
                const hostNameVal = line.substring(5).trim();
                // Exclude wildcard host blocks for privacy/noise reduction
                if (hostNameVal && hostNameVal !== '*') {
                    currentHost = {
                        alias: hostNameVal,
                        targetHostName: null,
                    };
                    hosts.push(currentHost);
                }
            } else if (currentHost && lower.startsWith('hostname ')) {
                currentHost.targetHostName = line.substring(9).trim();
            }
        }
    } catch {
        // SSH config does not exist or cannot be read, skip safely
    }

    return {
        available,
        hosts,
        breakdown: {
            hostCount: hosts.length,
        },
    };
}
