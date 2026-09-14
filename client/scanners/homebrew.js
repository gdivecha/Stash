import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function scanHomebrewEnvironment() {
    try {
        // Verify if Homebrew is installed and available in PATH
        await execAsync('brew --version');
        
        // Dump the active machine's bundle configuration directly to stdout
        const { stdout } = await execAsync('brew bundle dump --file=-');
        
        // Parse lines or pass raw Brewfile text safely
        const lines = stdout.split('\n').filter(Boolean);
        
        const taps = lines.filter(l => l.startsWith('tap'));
        const formulae = lines.filter(l => l.startsWith('brew'));
        const casks = lines.filter(l => l.startsWith('cask'));
        const masApps = lines.filter(l => l.startsWith('mas'));

        return {
            available: true,
            rawBrewfile: stdout,
            breakdown: {
                tapsCount: taps.length,
                formulaeCount: formulae.length,
                casksCount: casks.length,
                masCount: masApps.length,
            },
            taps,
            formulae,
            casks,
            masApps,
        };
    } catch (err) {
        return {
            available: false,
            error: 'Homebrew is not installed or unavailable on this system.',
            rawBrewfile: '',
            breakdown: { tapsCount: 0, formulaeCount: 0, casksCount: 0, masCount: 0 },
            taps: [],
            formulae: [],
            casks: [],
            masApps: [],
        };
    }
}
