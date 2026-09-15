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
import { 
    encryptPayload, 
    decryptPayload, 
    encryptSharablePayload, 
    decryptSharablePayload, 
    signData, 
    verifySignature 
} from '../utils/crypto.js';
import { validateMasterPassword } from '../utils/validator.js';

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

// --- NEW DIRECTORY PATH HELPERS (3-Tier Layout) ---
const getPersonalDir = (email, device, payloadType) => 
    path.join(process.cwd(), 'client', 'snapshots', 'personal', email, device, payloadType);

const getSharableDir = (payloadType) => 
    path.join(process.cwd(), 'client', 'snapshots', 'sharable', payloadType);

const getReceivedDir = (payloadType) => 
    path.join(process.cwd(), 'client', 'snapshots', 'received', payloadType);

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

            let masterSecret;
            while (true) {
                masterSecret = await password({ 
                    message: 'Enter master key password to encrypt:', 
                    mask: '*' 
                });

                const validation = validateMasterPassword(masterSecret);
                if (validation.isValid) {
                    break;
                }
                console.log(chalk.red(`\n❌ ${validation.message}\n`));
            }

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
            if (!activeAccountEmail) {
                console.log(chalk.red('\n❌ You must be logged in to pull snapshots from your personal vault.\n'));
                break;
            }

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

                const snapshotsDir = getPersonalDir(activeAccountEmail, selectedDevice, subFolder);
                await fs.mkdir(snapshotsDir, { recursive: true });
                
                const timeSlug = dayjs().format('YYYY-MM-DD-HHmmss');
                const exportFilename = `stash-encrypted-${workspace}-${timeSlug}.json`;
                const exportPath = path.join(snapshotsDir, exportFilename);
                
                await fs.writeFile(exportPath, JSON.stringify(responseData, null, 2), 'utf8');

                console.log(chalk.green(`\n✅ Stored under personal vault: ${exportPath}\n`));
            } catch (err) {
                console.log(chalk.red(`\n❌ Failed to save pulled snapshot: ${err.message}\n`));
            }
            break;
        }

        case 'vault_view': {
            if (!activeAccountEmail) {
                console.log(chalk.red('\n❌ You must be logged in to use vault_view.\n'));
                break;
            }

            const userSnapshotsDir = path.join(process.cwd(), 'client', 'snapshots', 'personal', activeAccountEmail);
            
            try {
                await fs.access(userSnapshotsDir);
            } catch {
                console.log(chalk.yellow(`\n⚠️ No personal snapshots directory found for account [${activeAccountEmail}]. Pull some ciphertext first!\n`));
                break;
            }

            const entries = await fs.readdir(userSnapshotsDir, { withFileTypes: true });
            const deviceDirs = entries.filter(dirent => dirent.isDirectory()).map(dirent => dirent.name);

            if (deviceDirs.length === 0) {
                console.log(chalk.yellow(`\n⚠️ No device snapshot folders found under client/snapshots/personal/${activeAccountEmail}/\n`));
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
                console.log(chalk.yellow(`\n⚠️ No encrypted snapshot files found in personal folder.\n`));
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

            let masterSecret;
            while (true) {
                masterSecret = await password({ 
                    message: 'Enter master key password to decrypt in-memory:', 
                    mask: '*'
                });

                const validation = validateMasterPassword(masterSecret);
                if (validation.isValid) {
                    break;
                }
                console.log(chalk.red(`\n❌ ${validation.message}\n`));
            }

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

        case 'vault_export': {
            if (!activeAccountEmail) {
                console.log(chalk.red('\n❌ You must be logged in to export personal snapshots.\n'));
                break;
            }

            const userSnapshotsDir = path.join(process.cwd(), 'client', 'snapshots', 'personal', activeAccountEmail);
            try {
                await fs.access(userSnapshotsDir);
            } catch {
                console.log(chalk.yellow(`\n⚠️ No personal snapshots found under client/snapshots/personal/${activeAccountEmail}/\n`));
                break;
            }

            const deviceDirs = (await fs.readdir(userSnapshotsDir, { withFileTypes: true }))
                .filter(d => d.isDirectory())
                .map(d => d.name);

            if (deviceDirs.length === 0) {
                console.log(chalk.yellow('\n⚠️ No device directories found.\n'));
                break;
            }

            const selectedDevice = await select({
                message: 'Select device source for export:',
                choices: [...deviceDirs.map(d => ({ name: d, value: d })), { name: '❌ Cancel', value: 'cancel' }]
            });
            if (selectedDevice === 'cancel') break;

            const payloadType = await select({
                message: 'Select payload category:',
                choices: [
                    { name: 'Declarative State', value: 'declarative' },
                    { name: 'Dotfiles', value: 'dotfiles' },
                    { name: 'Workspace Session', value: 'workspace_session' },
                    { name: '❌ Cancel', value: 'cancel' }
                ]
            });
            if (payloadType === 'cancel') break;

            const categoryDir = path.join(userSnapshotsDir, selectedDevice, payloadType);
            try {
                await fs.access(categoryDir);
            } catch {
                console.log(chalk.yellow(`\n⚠️ No snapshot category found at: ${categoryDir}\n`));
                break;
            }

            const files = (await fs.readdir(categoryDir)).filter(f => f.endsWith('.json'));
            if (files.length === 0) {
                console.log(chalk.yellow('\n⚠️ No snapshot files available to export.\n'));
                break;
            }

            const selectedFile = await select({
                message: 'Select snapshot file to export:',
                choices: [...files.map(f => ({ name: f, value: f })), { name: '❌ Cancel', value: 'cancel' }]
            });
            if (selectedFile === 'cancel') break;

            let masterSecret;
            while (true) {
                masterSecret = await password({ message: 'Enter your personal master password to decrypt source file:', mask: '*' });
                const validation = validateMasterPassword(masterSecret);
                if (validation.isValid) break;
                console.log(chalk.red(`\n❌ ${validation.message}\n`));
            }

            const sharedPassword = await password({ message: 'Enter a shared export password for your recipient:', mask: '*' });
            const confirmShared = await password({ message: 'Confirm shared export password:', mask: '*' });

            if (sharedPassword !== confirmShared) {
                console.log(chalk.red('\n❌ Shared passwords do not match. Aborting export.\n'));
                break;
            }

            try {
                const filePath = path.join(categoryDir, selectedFile);
                const fileContent = await fs.readFile(filePath, 'utf8');
                const wrapper = JSON.parse(fileContent);
                const payloadToDecrypt = wrapper?.payload || wrapper;

                const plaintextData = decryptPayload(payloadToDecrypt, masterSecret, activeAccountEmail);

                const privateKeyPem = process.env.STASH_PRIVATE_KEY;
                if (!privateKeyPem) {
                    console.log(chalk.red('\n❌ STASH_PRIVATE_KEY is missing from your .env.developmentlocal file.\n'));
                    break;
                }

                const { signature, publicKey } = signData(plaintextData, privateKeyPem);

                const envelope = {
                    data: plaintextData,
                    signer: {
                        publicKey,
                        signature
                    }
                };

                const encryptedEnvelope = encryptSharablePayload(envelope, sharedPassword);

                const sharableDir = getSharableDir(payloadType);
                await fs.mkdir(sharableDir, { recursive: true });

                const outFilename = `stash-shared-${selectedDevice}-${dayjs().format('YYYY-MM-DD-HHmmss')}.json`;
                const outPath = path.join(sharableDir, outFilename);

                await fs.writeFile(outPath, JSON.stringify(encryptedEnvelope, null, 2), 'utf8');
                console.log(chalk.green(`\n✅ Successfully exported sharable package to: ${outPath}\n`));
            } catch (err) {
                console.log(chalk.red(`\n❌ Export failed: ${err.message}\n`));
            }
            break;
        }

        case 'vault_view_shared': {
            const targetFolderChoice = await select({
                message: 'Select folder to inspect:',
                choices: [
                    { name: '📂 Sharable Exports (Outbound files under sharable/)', value: 'sharable' },
                    { name: '📂 Received Sharables (Inbound files under received/)', value: 'received' },
                    { name: '❌ Cancel', value: 'cancel' }
                ]
            });
            if (targetFolderChoice === 'cancel') break;

            const payloadType = await select({
                message: 'Select payload category:',
                choices: [
                    { name: 'Declarative State', value: 'declarative' },
                    { name: 'Dotfiles', value: 'dotfiles' },
                    { name: 'Workspace Session', value: 'workspace_session' },
                    { name: '❌ Cancel', value: 'cancel' }
                ]
            });
            if (payloadType === 'cancel') break;

            const targetDir = targetFolderChoice === 'sharable' ? getSharableDir(payloadType) : getReceivedDir(payloadType);

            try {
                await fs.access(targetDir);
            } catch {
                console.log(chalk.yellow(`\n⚠️ Directory not found: ${targetDir}\n`));
                break;
            }

            const files = (await fs.readdir(targetDir)).filter(f => f.endsWith('.json'));
            if (files.length === 0) {
                console.log(chalk.yellow(`\n⚠️ No files found under [${targetFolderChoice}/${payloadType}]\n`));
                break;
            }

            const selectedFile = await select({
                message: 'Select file to view:',
                choices: [...files.map(f => ({ name: f, value: f })), { name: '❌ Cancel', value: 'cancel' }]
            });
            if (selectedFile === 'cancel') break;

            const sharedPass = await password({ message: 'Enter shared export password:', mask: '*' });

            try {
                const fileContent = await fs.readFile(path.join(targetDir, selectedFile), 'utf8');
                const encryptedEnvelopeWrapper = JSON.parse(fileContent);

                const decryptedEnvelope = decryptSharablePayload(encryptedEnvelopeWrapper, sharedPass);

                const isValid = verifySignature(
                    decryptedEnvelope.data,
                    decryptedEnvelope.signer.signature,
                    decryptedEnvelope.signer.publicKey
                );

                console.log(chalk.cyan(`\n==================================================`));
                console.log(chalk.cyan(`   SHARED VIEW: [${targetFolderChoice}] / [${selectedFile}]`));
                console.log(chalk.cyan(`==================================================\n`));

                if (isValid) {
                    console.log(chalk.green('✅ Cryptographic Signature Verified: Authentic payload from sender!\n'));
                } else {
                    console.log(chalk.red('⚠️ WARNING: Signature verification failed! Content may be untrusted or tampered with.\n'));
                }

                console.dir(decryptedEnvelope.data, { depth: null, colors: true });
                console.log(chalk.cyan(`\n==================================================\n`));
            } catch (err) {
                console.log(chalk.red(`\n❌ Failed to decrypt file. Incorrect shared password or corrupted structure.\n`));
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
