import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export async function scanBrowserExtensions() {
    const platform = os.platform();
    const homeDir = os.homedir();
    
    // Define potential profile base paths for common Chromium browsers
    const browserPaths = {};

    if (platform === 'darwin') {
        browserPaths.Chrome = path.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome', 'Default', 'Extensions');
        browserPaths.Brave = path.join(homeDir, 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser', 'Default', 'Extensions');
        browserPaths.Edge = path.join(homeDir, 'Library', 'Application Support', 'Microsoft Edge', 'Default', 'Extensions');
        browserPaths.Vivaldi = path.join(homeDir, 'Library', 'Application Support', 'Vivaldi', 'Default', 'Extensions');
    } else if (platform === 'linux') {
        browserPaths.Chrome = path.join(homeDir, '.config', 'google-chrome', 'Default', 'Extensions');
        browserPaths.Brave = path.join(homeDir, '.config', 'BraveSoftware', 'Brave-Browser', 'Default', 'Extensions');
        browserPaths.Edge = path.join(homeDir, '.config', 'microsoft-edge', 'Default', 'Extensions');
    } else if (platform === 'win32') {
        browserPaths.Chrome = path.join(homeDir, 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default', 'Extensions');
        browserPaths.Brave = path.join(homeDir, 'AppData', 'Local', 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'Extensions');
        browserPaths.Edge = path.join(homeDir, 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data', 'Default', 'Extensions');
    }

    const results = {};
    let totalCount = 0;

    for (const [browserName, extensionsDir] of Object.entries(browserPaths)) {
        try {
            const entries = await fs.readdir(extensionsDir, { withFileTypes: true });
            const extensionIds = entries
                .filter(dirent => dirent.isDirectory() && /^[a-p]{32}$/.test(dirent.name))
                .map(dirent => dirent.name);

            if (extensionIds.length > 0) {
                results[browserName.toLowerCase()] = extensionIds;
                totalCount += extensionIds.length;
            }
        } catch {
            // Browser not installed or path doesn't exist on this machine; skip safely
        }
    }

    const hasAny = Object.keys(results).length > 0;

    return {
        available: hasAny,
        browsers: results,
        breakdown: {
            totalCount,
        },
        error: hasAny ? null : 'No supported browser extension directories found.',
    };
}
