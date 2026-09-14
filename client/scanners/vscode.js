import fs from 'fs/promises';
import path from 'path';
import os from 'os';

function getVSCodeUserDir() {
    const home = os.homedir();
    switch (os.platform()) {
        case 'darwin':
            return path.join(home, 'Library', 'Application Support', 'Code', 'User');
        case 'win32':
            return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Code', 'User');
        default:
            return path.join(home, '.config', 'Code', 'User');
    }
}

async function readJsonClean(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        const cleaned = data
            .replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*/g, '$1')
            .replace(/,\s*([\]}])/g, '$1');
        return JSON.parse(cleaned);
    } catch {
        return null;
    }
}

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
                        version: pkg.version,
                        id: `${pkg.publisher}.${pkg.name}`
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

export async function scanVSCodeEnvironment() {
    const userDir = getVSCodeUserDir();
    const extensions = await scanVSCodeExtensions();

    const userSettings = await readJsonClean(path.join(userDir, 'settings.json'));
    const keybindings = await readJsonClean(path.join(userDir, 'keybindings.json'));

    const snippetsDir = path.join(userDir, 'snippets');
    const snippets = {};
    try {
        const snippetFiles = await fs.readdir(snippetsDir);
        for (const file of snippetFiles) {
            if (file.endsWith('.json')) {
                const content = await readJsonClean(path.join(snippetsDir, file));
                if (content) snippets[file] = content;
            }
        }
    } catch {}

    return {
        metadata: {
            platform: os.platform(),
            exportedAt: new Date().toISOString(),
        },
        extensions,
        settings: userSettings || {},
        keybindings: keybindings || [],
        snippets,
    };
}
