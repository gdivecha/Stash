import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export async function scanTerminalEnvironment() {
    const homeDir = os.homedir();
    const tmuxPath = path.join(homeDir, '.tmux.conf');
    const weztermPath = path.join(homeDir, '.config', 'wezterm', 'wezterm.lua');

    const terminalConfig = {
        tmux: { available: false, lines: [] },
        wezterm: { available: false, configFound: false },
        breakdown: {
            tmuxLinesCount: 0,
            weztermActive: false,
        }
    };

    // Scan Tmux Configuration (.tmux.conf)
    try {
        const tmuxContent = await fs.readFile(tmuxPath, 'utf8');
        terminalConfig.tmux.available = true;
        const lines = tmuxContent.split('\n');
        
        for (let line of lines) {
            line = line.trim();
            if (!line || line.startsWith('#')) continue;

            const lower = line.toLowerCase();
            // Filter out any lines that might look like sensitive tokens or keys
            if (lower.includes('key') || lower.includes('secret') || lower.includes('password')) continue;

            terminalConfig.tmux.lines.push(line);
        }
        terminalConfig.breakdown.tmuxLinesCount = terminalConfig.tmux.lines.length;
    } catch {
        // Tmux config doesn't exist, skip safely
    }

    // Scan WezTerm Configuration (wezterm.lua)
    try {
        await fs.access(weztermPath);
        terminalConfig.wezterm.available = true;
        terminalConfig.wezterm.configFound = true;
        terminalConfig.breakdown.weztermActive = true;
    } catch {
        // WezTerm config doesn't exist, skip safely
    }

    return terminalConfig;
}
