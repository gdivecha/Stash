import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export async function scanVSCodeExtensions() {
    const homeDir = os.homedir();
    const extensionsDir = path.join(homeDir, '.vscode', 'extensions');
    const extensions = [];

    try {
        const entries = await fs.readdir(extensionsDir, { withFileTypes: true });
        
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const packageJsonPath = path.join(extensionsDir, entry.name, 'package.json');
                try {
                    const data = await fs.readFile(packageJsonPath, 'utf8');
                    const pkg = JSON.parse(data);

                    extensions.push({
                        name: pkg.name,
                        publisher: pkg.publisher,
                        version: pkg.version
                    });
                } catch (err) {
                    if (err.code !== 'ENOENT') {
                        console.warn(`Warning reading ${packageJsonPath}:`, err.message);
                    }
                }
            }
        }

        return extensions;
    } catch (error) {
        console.error('Error reading extensions directory:', error.message);
        return extensions;
    }
}
