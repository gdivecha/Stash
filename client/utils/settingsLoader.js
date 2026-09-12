import fs from 'fs/promises';
import path from 'path';
import { 
    fileURLToPath,
} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function loadStashConfig() {
    try {
        const settingsPath = path.resolve(
            __dirname, 
            '../../config/stash.settings.json'
        );
        const rawData = await fs.readFile(
            settingsPath, 
            'utf8'
        );
        return {
            clientSettings: JSON.parse(rawData)
        };
    } catch (error) {
        throw new Error(`Failed to load Stash settings from disk: ${error.message}`);
    }
}