import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export async function scanShellEnvironment() {
    const homeDir = os.homedir();
    const filesToCheck = ['.zshrc', '.bashrc', '.bash_profile', '.zprofile'];
    
    const aliases = {};
    const functions = [];
    let foundFiles = 0;

    for (const filename of filesToCheck) {
        const filePath = path.join(homeDir, filename);
        try {
            const content = await fs.readFile(filePath, 'utf8');
            foundFiles++;
            const lines = content.split('\n');

            for (let line of lines) {
                line = line.trim();
                if (!line || line.startsWith('#')) continue;

                // Exclude lines containing potential secrets, tokens, or exports
                const lower = line.toLowerCase();
                if (
                    lower.includes('key') || 
                    lower.includes('secret') || 
                    lower.includes('token') || 
                    lower.includes('password') || 
                    lower.startsWith('export')
                ) {
                    continue;
                }

                // Parse standard shell aliases (e.g., alias gs="git status")
                if (line.startsWith('alias ')) {
                    const actualAlias = line.substring(6).trim();
                    const eqIndex = actualAlias.indexOf('=');
                    if (eqIndex !== -1) {
                        const name = actualAlias.substring(0, eqIndex).trim();
                        let val = actualAlias.substring(eqIndex + 1).trim();
                        
                        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                            val = val.slice(1, -1);
                        }
                        aliases[name] = val;
                    }
                }

                // Parse function shorthands (e.g., myfunc() {)
                const funcMatch = line.match(/^([a-zA-Z0-9_-]+)\s*\(\)\s*\{?/);
                if (funcMatch && !functions.includes(funcMatch[1])) {
                    functions.push(funcMatch[1]);
                }
            }
        } catch {
            // File does not exist or lacks read permission, skip safely
        }
    }

    const aliasCount = Object.keys(aliases).length;
    const functionCount = functions.length;

    return {
        available: foundFiles > 0,
        aliases,
        functions,
        breakdown: {
            aliasCount,
            functionCount,
            totalCount: aliasCount + functionCount,
        },
    };
}
