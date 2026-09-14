import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';

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

export async function scanGitRepositories(customSubdir = 'Developer') {
    // Resolve relative to home directory, allowing custom override
    const searchBase = path.join(os.homedir(), customSubdir);
    
    try {
        const findCmd = process.platform === 'win32'
            ? `Get-ChildItem -Path "${searchBase}" -Recurse -Directory -Filter ".git" -Depth 3 | Select-Object -ExpandProperty FullName`
            : `find "${searchBase}" -name ".git" -type d -maxdepth 3 2>/dev/null`;

        const { stdout } = await execAsync(findCmd);
        const gitDirs = stdout.split('\n').filter(Boolean);

        const repositories = [];

        for (const gitDir of gitDirs) {
            const repoPath = path.dirname(gitDir);
            const repoName = path.basename(repoPath);

            try {
                const { stdout: remoteOut } = await execAsync('git config --get remote.origin.url', { cwd: repoPath });
                const remoteUrl = remoteOut.trim() || null;

                const { stdout: branchOut } = await execAsync('git branch --show-current', { cwd: repoPath });
                const branch = branchOut.trim() || 'HEAD (detached)';

                repositories.push({
                    name: repoName,
                    path: repoPath,
                    remoteUrl,
                    branch,
                });
            } catch {
                // Skip if git commands fail for specific subpaths
            }
        }

        return {
            available: true,
            repositories,
            breakdown: {
                repoCount: repositories.length,
            },
            error: null,
        };
    } catch (err) {
        return {
            available: false,
            repositories: [],
            breakdown: { repoCount: 0 },
            error: `Unable to scan local git repositories at path: ${searchBase}`,
        };
    }
}
