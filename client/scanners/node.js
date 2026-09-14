import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function scanNodeEnvironment() {
    try {
        const nodeVersion = process.version;
        
        let npmGlobalPackages = [];
        try {
            const { stdout } = await execAsync('npm list -g --depth=0 --json');
            const parsed = JSON.parse(stdout);
            if (parsed.dependencies) {
                npmGlobalPackages = Object.keys(parsed.dependencies);
            }
        } catch {
            // Fallback if npm list fails or isn't formatted as expected
        }

        let pnpmGlobalPackages = [];
        try {
            const { stdout } = await execAsync('pnpm list -g --depth=0 --json');
            const parsed = JSON.parse(stdout);
            // Handle pnpm list output structure safely
            const packages = Array.isArray(parsed) ? parsed : parsed.dependencies || [];
            pnpmGlobalPackages = Array.isArray(packages) 
                ? packages.map(p => p.name || p) 
                : Object.keys(packages);
        } catch {
            // pnpm might not be installed or active
        }

        return {
            available: true,
            nodeVersion,
            npmGlobalPackages,
            pnpmGlobalPackages,
            breakdown: {
                npmCount: npmGlobalPackages.length,
                pnpmCount: pnpmGlobalPackages.length,
            },
        };
    } catch (err) {
        return {
            available: false,
            error: 'Node environment check failed.',
            nodeVersion: process.version,
            npmGlobalPackages: [],
            pnpmGlobalPackages: [],
            breakdown: { npmCount: 0, pnpmCount: 0 },
        };
    }
}
