import input from '@inquirer/input';
import password from '@inquirer/password';
import checkbox from '@inquirer/checkbox';
import select from '@inquirer/select';
import chalk from 'chalk';
import dayjs from 'dayjs';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import machineIdPkg from 'node-machine-id';

import { api, getActiveAccount } from '../utils/context.js';
import { encryptPayload, decryptPayload } from '../utils/crypto.js';

// Import your environment scanners
import { scanVSCodeEnvironment } from '../scanners/vscode.js';
import { scanHomebrewEnvironment } from '../scanners/homebrew.js';
import { scanNodeEnvironment } from '../scanners/node.js';
import { scanBrowserExtensions } from '../scanners/browser.js';
import { scanDockerEnvironment } from '../scanners/docker.js';
import { scanGitConfigEnvironment, scanGitRepositories } from '../scanners/git.js';
import { scanShellEnvironment } from '../scanners/shell.js';
import { scanSSHEnvironment } from '../scanners/ssh.js';
import { scanTerminalEnvironment } from '../scanners/terminal.js';

export async function handleVaultAction(action) {
    const activeAccountEmail = getActiveAccount();

    switch (action) {
        case 'vault_push': {
            const type = await input({ 
                message: 'Payload type:', 
                default: 'declarative_state' 
            });
            const workspace = await input({ 
                message: 'Workspace name:', 
                default: 'default' 
            });

            const selectedScanners = await checkbox({
                message: 'Select environment scanners to run:',
                choices: [
                    { name: 'VS Code Environment', value: 'vscode', checked: true },
                    { name: 'Homebrew Environment', value: 'homebrew', checked: true },
                    { name: 'Node Environment', value: 'node', checked: true },
                    { name: 'Git Config & Repositories', value: 'git', checked: true },
                    { name: 'Shell Environment', value: 'shell', checked: true },
                    { name: 'SSH Environment', value: 'ssh', checked: true },
                    { name: 'Browser Extensions', value: 'browser', checked: true },
                    { name: 'Docker Environment', value: 'docker', checked: true },
                    { name: 'Terminal Environment', value: 'terminal', checked: true },
                ],
            });

            let gitSubdir = 'Developer';
            if (selectedScanners.includes('git')) {
                gitSubdir = await input({
                    message: 'Git scan path relative to home (~/):',
                    default: 'Developer'
                });
            }

            console.log(chalk.cyan('\n🔍 Scanning selected system environments...'));
            
            const snapshotData = {
                workspace,
                timestamp: dayjs().toISOString(),
            };

            let itemCount = 0;

            if (selectedScanners.includes('vscode')) {
                snapshotData.vscode = await scanVSCodeEnvironment();
                itemCount += snapshotData.vscode.extensions.length;
            }
            if (selectedScanners.includes('homebrew')) {
                snapshotData.homebrew = await scanHomebrewEnvironment();
                itemCount += snapshotData.homebrew.breakdown.formulaeCount + snapshotData.homebrew.breakdown.casksCount;
            }
            if (selectedScanners.includes('node')) {
                snapshotData.node = await scanNodeEnvironment();
                itemCount += snapshotData.node.breakdown.npmCount + snapshotData.node.breakdown.pnpmCount;
            }
            if (selectedScanners.includes('git')) {
                const gitConfigSnapshot = await scanGitConfigEnvironment();
                const gitReposSnapshot = await scanGitRepositories(gitSubdir);
                snapshotData.git = {
                    config: gitConfigSnapshot,
                    repositories: gitReposSnapshot,
                    breakdown: {
                        settingsCount: gitConfigSnapshot.breakdown.settingsCount,
                        repoCount: gitReposSnapshot.breakdown.repoCount,
                    },
                };
                itemCount += gitConfigSnapshot.breakdown.settingsCount + gitReposSnapshot.breakdown.repoCount;
            }
            if (selectedScanners.includes('shell')) {
                snapshotData.shell = await scanShellEnvironment();
                itemCount += snapshotData.shell.breakdown.totalCount;
            }
            if (selectedScanners.includes('ssh')) {
                snapshotData.ssh = await scanSSHEnvironment();
                itemCount += snapshotData.ssh.breakdown.hostCount;
            }
            if (selectedScanners.includes('browser')) {
                snapshotData.browser = await scanBrowserExtensions();
                itemCount += snapshotData.browser.breakdown.totalCount;
            }
            if (selectedScanners.includes('docker')) {
                snapshotData.docker = await scanDockerEnvironment();
                itemCount += snapshotData.docker.breakdown.activeCount;
            }
            if (selectedScanners.includes('terminal')) {
                snapshotData.terminal = await scanTerminalEnvironment();
                itemCount += snapshotData.terminal.breakdown.tmuxLinesCount + (snapshotData.terminal.breakdown.weztermActive ? 1 : 0);
            }

            const masterSecret = await password({ 
                message: 'Enter master key password to encrypt:', 
                mask: '*' 
            });

            const encrypted = encryptPayload(snapshotData, masterSecret, activeAccountEmail);

            const shortId = machineIdPkg.machineIdSync().slice(0, 6);
            const deviceIdentifier = `${os.hostname()}-${shortId}`;

            const payloadBody = {
                schemaVersion: '1.0.0',
                payload: {
                    ciphertext: encrypted.ciphertext,
                    iv: encrypted.iv,
                    authTag: encrypted.authTag,
                    salt: encrypted.salt,
                },
                metadata: {
                    payloadType: type,
                    workspaceName: workspace,
                    device: { 
                        deviceId: deviceIdentifier,
                        arch: process.arch,
                        hostname: os.hostname(),
                        platform: process.platform,
                    },
                    itemCount,
                },
            };

            const res = await api.post('/vault/push', payloadBody);
            console.log(chalk.green(`\n✅ Encrypted user setup (${itemCount} total items across selected system scopes) and pushed to vault!`));
            console.dir(res.data, { depth: null, colors: true });
            console.log('');
            break;
        }

        case 'vault_pull': {
            const type = await input({ message: 'Payload type (declarative_state, dotfiles, workspace_session):', default: 'declarative_state' });
            const workspace = await input({ message: 'Workspace name:', default: 'default' });
            
            let selectedDevice;
            try {
                const summaryRes = await api.get('/vault/summary');
                const summaryData = summaryRes.data?.data || {};
                
                let deviceMap = {};
                if (type === 'declarative_state') {
                    deviceMap = summaryData.declarativeState || {};
                } else if (type === 'dotfiles') {
                    deviceMap = summaryData.dotfiles || {};
                } else if (type === 'workspace_session') {
                    const matchingWorkspaces = (summaryData.workspaces || []).filter(w => w.workspaceName === workspace);
                    matchingWorkspaces.forEach(w => {
                        deviceMap[w.deviceId] = { updatedAt: w.updatedAt, metadata: w.metadata };
                    });
                }

                const deviceIds = Object.keys(deviceMap);

                if (deviceIds.length === 0) {
                    console.log(chalk.yellow(`\n⚠️ No snapshots found in your vault for type [${type}] and workspace [${workspace}].\n`));
                    break;
                }

                const shortId = machineIdPkg.machineIdSync().slice(0, 6);
                const currentDeviceIdentifier = `${os.hostname()}-${shortId}`;

                const choices = deviceIds.map(deviceId => {
                    const info = deviceMap[deviceId];
                    const dateStr = info?.updatedAt ? dayjs(info.updatedAt).format('YYYY-MM-DD HH:mm:ss') : 'Unknown time';
                    const isCurrent = deviceId === currentDeviceIdentifier;
                    return {
                        name: `${isCurrent ? '💻 (This Device)' : '🖥️'} ${deviceId} — (Updated: ${dateStr})`,
                        value: deviceId,
                    };
                });
                choices.push({ name: '❌ Cancel', value: 'cancel' });

                selectedDevice = await select({
                    message: 'Select which device snapshot you want to pull from:',
                    choices,
                });

                if (selectedDevice === 'cancel') break;
            } catch (err) {
                console.log(chalk.yellow('\n⚠️ Could not fetch multi-device summary. Falling back to current machine ID...'));
                const shortId = machineIdPkg.machineIdSync().slice(0, 6);
                selectedDevice = `${os.hostname()}-${shortId}`;
            }

            const res = await api.get(`/vault/pull/${type}/${workspace}?deviceId=${selectedDevice}`);
            console.log(chalk.cyan(`\n📦 Received raw encrypted payload from server vault for device [${selectedDevice}]. Saving ciphertext locally...`));

            try {
                const responseData = res.data?.data || res.data;
                
                let subFolder = 'declarative';
                if (type === 'dotfiles') subFolder = 'dotfiles';
                if (type === 'workspace_session') subFolder = 'workspace_session';

                const snapshotsDir = path.join(process.cwd(), 'client', 'snapshots', activeAccountEmail, selectedDevice, subFolder);
                await fs.mkdir(snapshotsDir, { recursive: true });
                
                const timeSlug = dayjs().format('YYYY-MM-DD-HHmmss');
                const exportFilename = `stash-encrypted-${workspace}-${timeSlug}.json`;
                const exportPath = path.join(snapshotsDir, exportFilename);
                
                await fs.writeFile(exportPath, JSON.stringify(responseData, null, 2), 'utf8');

                console.log(chalk.green(`\n✅ Encrypted ciphertext successfully stored locally at: client/snapshots/${activeAccountEmail}/${selectedDevice}/${subFolder}/${exportFilename}\n`));
            } catch (err) {
                console.log(chalk.red(`\n❌ Failed to save pulled snapshot: ${err.message}\n`));
            }
            break;
        }

        case 'vault_view': {
            const userSnapshotsDir = path.join(process.cwd(), 'client', 'snapshots', activeAccountEmail);
            
            try {
                await fs.access(userSnapshotsDir);
            } catch {
                console.log(chalk.yellow(`\n⚠️ No local snapshots directory found for account [${activeAccountEmail}]. Pull some ciphertext first!\n`));
                break;
            }

            const entries = await fs.readdir(userSnapshotsDir, { withFileTypes: true });
            const deviceDirs = entries.filter(dirent => dirent.isDirectory()).map(dirent => dirent.name);

            if (deviceDirs.length === 0) {
                console.log(chalk.yellow(`\n⚠️ No device snapshot folders found under client/snapshots/${activeAccountEmail}/\n`));
                break;
            }

            const shortId = machineIdPkg.machineIdSync().slice(0, 6);
            const currentDeviceIdentifier = `${os.hostname()}-${shortId}`;

            const deviceChoices = deviceDirs.map(deviceId => ({
                name: deviceId === currentDeviceIdentifier ? `💻 ${deviceId} (This Device)` : `💻 ${deviceId}`,
                value: deviceId,
            }));
            deviceChoices.push({ name: '❌ Cancel', value: 'cancel' });

            const selectedDevice = await select({
                message: 'Select device to inspect snapshots for:',
                choices: deviceChoices,
            });

            if (selectedDevice === 'cancel') break;

            const category = await select({
                message: 'Select snapshot category to inspect:',
                choices: [
                    { name: '📂 Declarative State', value: 'declarative' },
                    { name: '📂 Dotfiles', value: 'dotfiles' },
                    { name: '📂 Workspace Session', value: 'workspace_session' },
                    { name: '❌ Cancel', value: 'cancel' },
                ],
            });

            if (category === 'cancel') break;

            const categoryDir = path.join(userSnapshotsDir, selectedDevice, category);
            
            try {
                await fs.access(categoryDir);
            } catch {
                console.log(chalk.yellow(`\n⚠️ No local snapshots directory found for category [${category}] on device [${selectedDevice}].\n`));
                break;
            }

            const files = await fs.readdir(categoryDir);
            const jsonFiles = files.filter(file => file.endsWith('.json'));

            if (jsonFiles.length === 0) {
                console.log(chalk.yellow(`\n⚠️ No encrypted snapshot files found in client/snapshots/${activeAccountEmail}/${selectedDevice}/${category}/\n`));
                break;
            }

            const fileChoices = jsonFiles.map(file => ({
                name: `📄 ${file.replace('stash-encrypted-', '').replace('.json', '')}`,
                value: file,
            }));
            fileChoices.push({ name: '❌ Cancel', value: 'cancel' });

            const selectedFile = await select({
                message: 'Select an encrypted snapshot file to view:',
                choices: fileChoices,
            });

            if (selectedFile === 'cancel') break;

            const filePath = path.join(categoryDir, selectedFile);
            const fileContent = await fs.readFile(filePath, 'utf8');
            const encryptedPayloadWrapper = JSON.parse(fileContent);
            const payloadToDecrypt = encryptedPayloadWrapper?.payload || encryptedPayloadWrapper;

            const masterSecret = await password({ 
                message: 'Enter master key password to decrypt in-memory:', 
                mask: '*'
            });

            try {
                const decryptedObj = decryptPayload(payloadToDecrypt, masterSecret, activeAccountEmail);

                console.log(chalk.cyan(`\n==================================================`));
                console.log(chalk.cyan(`   IN-MEMORY VIEW: Device [${selectedDevice}] / [${selectedFile}]`));
                console.log(chalk.cyan(`==================================================\n`));
                
                console.dir(decryptedObj, { depth: null, colors: true });
                
                console.log(chalk.cyan(`\n==================================================`));
                console.log(chalk.green('✅ Session inspection complete. Plaintext data was held strictly in-memory and discarded.\n'));
            } catch (err) {
                console.log(chalk.red('\n❌ Decryption failed! Invalid master key password or corrupted ciphertext.\n'));
            }
            break;
        }

        case 'vault_summary': {
            const res = await api.get('/vault/summary');
            console.log(chalk.cyan('\n--- Vault Summary ---'));
            console.dir(res.data, { depth: null, colors: true });
            console.log('');
            break;    
        }

        case 'vault_delete': {
            const type = await input({ message: 'Payload type (declarative_state, dotfiles, workspace_session):', default: 'declarative_state' });
            const workspace = await input({ message: 'Workspace name:', default: 'default' });
            
            try {
                const summaryRes = await api.get('/vault/summary');
                const summaryData = summaryRes.data?.data || {};
                
                let deviceMap = {};
                if (type === 'declarative_state') {
                    deviceMap = summaryData.declarativeState || {};
                } else if (type === 'dotfiles') {
                    deviceMap = summaryData.dotfiles || {};
                } else if (type === 'workspace_session') {
                    const matchingWorkspaces = (summaryData.workspaces || []).filter(w => w.workspaceName === workspace);
                    matchingWorkspaces.forEach(w => {
                        deviceMap[w.deviceId] = { updatedAt: w.updatedAt, metadata: w.metadata };
                    });
                }

                const deviceIds = Object.keys(deviceMap);

                if (deviceIds.length === 0) {
                    console.log(chalk.yellow(`\n⚠️ No snapshots found in your vault to delete for type [${type}] and workspace [${workspace}].\n`));
                    break;
                }

                const shortId = machineIdPkg.machineIdSync().slice(0, 6);
                const currentDeviceIdentifier = `${os.hostname()}-${shortId}`;

                const choices = deviceIds.map(deviceId => {
                    const info = deviceMap[deviceId];
                    const dateStr = info?.updatedAt ? dayjs(info.updatedAt).format('YYYY-MM-DD HH:mm:ss') : 'Unknown time';
                    const isCurrent = deviceId === currentDeviceIdentifier;
                    return {
                        name: `${isCurrent ? '💻 (This Device)' : '🖥️'} ${deviceId} — (Updated: ${dateStr})`,
                        value: deviceId,
                    };
                });
                choices.push({ name: '❌ Cancel', value: 'cancel' });

                const selectedDevice = await select({
                    message: 'Select which device snapshot you want to delete from vault:',
                    choices,
                });

                if (selectedDevice === 'cancel') break;

                const confirm = await input({ message: `Type "DELETE" to permanently remove snapshot for device [${selectedDevice}]:` });
                if (confirm !== 'DELETE') {
                    console.log(chalk.yellow('\nDeletion canceled.\n'));
                    break;
                }

                await api.delete(`/vault/${type}/${workspace}?deviceId=${selectedDevice}`);
                console.log(chalk.green(`\n✅ Snapshot [${type}/${workspace}] for device [${selectedDevice}] permanently removed from vault.\n`));
            } catch (err) {
                console.log(chalk.red(`\n❌ Failed to delete snapshot: ${err.message}\n`));
            }
            break;
        }
    }
}
