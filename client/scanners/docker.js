import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function scanDockerEnvironment() {
    try {
        // Check if docker CLI is available and daemon is running
        await execAsync('docker info --format "{{.ServerVersion}}"');

        // Fetch running containers with structured formatting: Name, Image, Ports, State
        const { stdout } = await execAsync(
            'docker ps --format "{{isjon .}}"'
        );

        const lines = stdout.trim().split('\n').filter(Boolean);
        const containers = lines.map(line => {
            try {
                const parsed = JSON.parse(line);
                return {
                    name: parsed.Names,
                    image: parsed.Image,
                    ports: parsed.Ports,
                    status: parsed.State,
                };
            } catch {
                return null;
            }
        }).filter(Boolean);

        return {
            available: true,
            containers,
            breakdown: {
                activeCount: containers.length,
            },
            error: null,
        };
    } catch (err) {
        return {
            available: false,
            containers: [],
            breakdown: {
                activeCount: 0,
                },
            error: 'Docker daemon is not running or CLI is unavailable.',
        };
    }
}
