import select from '@inquirer/select';
import checkbox from '@inquirer/checkbox';
import input from '@inquirer/input';
import password from '@inquirer/password';
import axios from 'axios';
import chalk from 'chalk';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import dayjs from 'dayjs';

import machineIdPkg from 'node-machine-id';

import { 
    scanVSCodeEnvironment,
} from '../scanners/vscode.js';
import {
    scanHomebrewEnvironment,
} from '../scanners/homebrew.js';
import {
    scanNodeEnvironment,
} from '../scanners/node.js';
import {
    scanBrowserExtensions,
} from '../scanners/browser.js';
import {
    scanDockerEnvironment,
} from '../scanners/docker.js';
import {
    scanGitConfigEnvironment,
    scanGitRepositories,
} from '../scanners/git.js';
import {
    scanShellEnvironment,
} from '../scanners/shell.js';
import {
    scanSSHEnvironment,
} from '../scanners/ssh.js';
import {
    scanTerminalEnvironment,
} from '../scanners/terminal.js';
import {
    encryptPayload,
    decryptPayload,
} from './crypto.js';
import {
    BACKEND_SERVER_URL,
    BACKEND_API_VERSION,
} from '../../env.js';

// In-memory multi-account session registry (Zero persistent caching on disk)
const activeSessions = new Map(); // Map<email, token>
let activeAccountEmail = null;

export const api = axios.create({
    baseURL: `${BACKEND_SERVER_URL}/${BACKEND_API_VERSION}`,
    withCredentials: true,
});

api.interceptors.request.use((config) => {
    if (activeAccountEmail && activeSessions.has(activeAccountEmail)) {
        config.headers.Cookie = `token=${activeSessions.get(activeAccountEmail)}`;
    }
    return config;
});

// Response interceptor to gracefully handle token expiration (401 Unauthorized)
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        if (error.response && error.response.status === 401 && activeAccountEmail && !originalRequest._retry) {
            originalRequest._retry = true;
            
            const expiredEmail = activeAccountEmail;
            console.log(chalk.yellow(`\n⚠️ Session expired or unauthorized for [${expiredEmail}]. Cleaning up session...`));
            
            activeSessions.delete(expiredEmail);
            const remainingAccounts = Array.from(activeSessions.keys());

            if (remainingAccounts.length === 0) {
                activeAccountEmail = null;
                console.log(chalk.red('❌ Your active session has expired and no other accounts remain. Please sign in again.\n'));
            } else if (remainingAccounts.length === 1) {
                activeAccountEmail = remainingAccounts[0];
                console.log(chalk.green(`🔄 Automatically switched to remaining active account: [${activeAccountEmail}]\n`));
            } else {
                console.log(chalk.yellow('Please select a fallback account for your current session:'));
                const fallbackChoice = await select({
                    message: 'Select fallback account:',
                    choices: remainingAccounts.map(email => ({
                        name: `👤 ${email}`,
                        value: email,
                    })),
                });
                activeAccountEmail = fallbackChoice;
                console.log(chalk.green(`\n✅ Active session successfully switched to: [${activeAccountEmail}]\n`));
            }
        }
        return Promise.reject(error);
    }
);

export function setSessionToken(token, email = 'default') {
    activeSessions.set(email, token);
    activeAccountEmail = email;
}

export async function startInteractiveConsole() {
    console.clear();
    console.log(chalk.bold.cyan('========================================'));
    console.log(chalk.bold.cyan('      STASH INTERACTIVE MANAGEMENT      '));
    console.log(chalk.bold.cyan('========================================\n'));

    while (true) {
        const accountHeader = activeAccountEmail ? chalk.green(`[Active Account: ${activeAccountEmail}]`) : chalk.yellow('[No Active Account]');
        console.log(accountHeader);

        const choices = [];

        if (!activeAccountEmail) {
            choices.push(
                { name: '🔐 Auth: Sign Up', value: 'auth_signup' },
                { name: '🔑 Auth: Sign In', value: 'auth_signin' }
            );
        } else {
            choices.push(
                { name: '🔄 Auth: Switch / Manage Accounts', value: 'auth_switch' },
                { name: '🚪 Auth: Sign Out Current Account', value: 'auth_signout' },
                { name: '👤 User: Get Profile (Me)', value: 'user_me' },
                { name: '✏️  User: Update Profile', value: 'user_update' },
                { name: '⚠️  User: Delete Account', value: 'user_delete' },
                { name: '📦 Vault: Push Encrypted Snapshot', value: 'vault_push' },
                { name: '📥 Vault: Pull Encrypted Ciphertext', value: 'vault_pull' },
                { name: '👁️  Vault: View Local Snapshot (In-Memory Decrypt)', value: 'vault_view' },
                { name: '📊 Vault: Summary', value: 'vault_summary' },
                { name: '🗑️  Vault: Delete Snapshot', value: 'vault_delete' }
            );
        }

        choices.push({ name: '❌ Exit Console', value: 'exit' });

        const action = await select({
            message: 'Select an operation family',
            choices,
        });

        if (action === 'exit') {
            console.log(chalk.yellow('Exiting Stash console. Safe travels!'));
            break;
        }

        try {
            await handleAction(action);
        } catch (err) {
            const errMsg = err.response?.data?.message 
                            || err.response?.data?.error 
                            || err.message;     
            console.log(chalk.red(`\n❌ Error [${err.response?.status || 500}]: ${errMsg}\n`));
        }
    }
}

export async function handleAction(action) {
    const publicActions = ['auth_signup', 'auth_signin'];
    if (!activeAccountEmail && !publicActions.includes(action)) {
        console.log(chalk.yellow('\n⚠️ You must sign in or sign up first to perform this action.\n'));
        return;
    }

    switch (action) {
        case 'auth_signup': {
            const name = await input({ message: 'Enter full name:' });
            const email = await input({ message: 'Enter email:' });
            const pass = await password({ message: 'Enter password:', mask: '*' });

            const res = await api.post(
                '/auth/sign-up', 
                { 
                    name, 
                    email, 
                    password: pass 
                });

            const token = extractCookieToken(res);
            if (token) {
                activeSessions.set(email, token);
                activeAccountEmail = email;
            }
            console.log(chalk.green(`\n✅ Account created successfully and active session set for [${email}]!\n`));
            break;        
        }

        case 'auth_signin': {
            const email = await input({ message: 'Enter email:' });
            const pass = await password({ message: 'Enter password:', mask: '*' });

            const res = await api.post(
                '/auth/sign-in', 
                { 
                    email, 
                    password: pass 
                }
            );

            const token = extractCookieToken(res);
            if (token) {
                activeSessions.set(email, token);
                activeAccountEmail = email;
            }
            console.log(chalk.green(`\n✅ Signed in successfully! Active session switched to [${email}].\n`));
            break;
        }

        case 'auth_switch': {
            const accounts = Array.from(activeSessions.keys());
            
            const subActionChoices = [
                { name: '➕ Sign in to a different account', value: 'signin_another' },
                { name: '🔐 Sign up for a new account', value: 'signup_another' },
                { name: '❌ Cancel', value: 'cancel' }
            ];

            if (accounts.length > 0) {
                const accountChoices = accounts.map(email => ({
                    name: email === activeAccountEmail ? `👤 ${email} (current)` : `👤 ${email}`,
                    value: `switch_${email}`,
                }));
                subActionChoices.unshift(...accountChoices);
            }

            const selection = await select({
                message: 'Account Management:',
                choices: subActionChoices,
            });

            if (selection === 'cancel') {
                break;
            }

            if (selection === 'signin_another') {
                const email = await input({ message: 'Enter email to sign in:' });
                const pass = await password({ message: 'Enter password:', mask: '*' });

                const res = await api.post('/auth/sign-in', { email, password: pass });
                const token = extractCookieToken(res);
                if (token) {
                    activeSessions.set(email, token);
                    activeAccountEmail = email;
                }
                console.log(chalk.green(`\n✅ Signed in successfully! Active session switched to [${email}].\n`));
                break;
            }

            if (selection === 'signup_another') {
                const name = await input({ message: 'Enter full name:' });
                const email = await input({ message: 'Enter email:' });
                const pass = await password({ message: 'Enter password:', mask: '*' });

                const res = await api.post('/auth/sign-up', { name, email, password: pass });
                const token = extractCookieToken(res);
                if (token) {
                    activeSessions.set(email, token);
                    activeAccountEmail = email;
                }
                console.log(chalk.green(`\n✅ Account created successfully and active session set to [${email}]!\n`));
                break;
            }

            if (selection.startsWith('switch_')) {
                const targetEmail = selection.replace('switch_', '');
                if (targetEmail === activeAccountEmail) {
                    console.log(chalk.yellow(`\n⚠️ You are already logged into that account and are active on it right now.\n`));
                    break;
                }
                activeAccountEmail = targetEmail;
                console.log(chalk.green(`\n✅ Active session switched to: ${activeAccountEmail}\n`));
                break;
            }
            break;
        }

        case 'auth_signout': {
            if (!activeAccountEmail) {
                console.log(chalk.yellow('\n⚠️ No active account to sign out from.\n'));
                break;
            }

            const currentEmail = activeAccountEmail;
            
            await api.post('/auth/sign-out').catch(() => {});
            
            activeSessions.delete(currentEmail);
            console.log(chalk.yellow(`\n✅ Account [${currentEmail}] signed out and removed from memory.`));

            const remainingAccounts = Array.from(activeSessions.keys());

            if (remainingAccounts.length === 0) {
                activeAccountEmail = null;
                console.log(chalk.yellow('No other active accounts remaining. You are now logged out.\n'));
            } else if (remainingAccounts.length === 1) {
                activeAccountEmail = remainingAccounts[0];
                console.log(chalk.green(`Automatically switched to remaining account: [${activeAccountEmail}]\n`));
            } else {
                const fallbackChoice = await select({
                    message: 'Select an account to fall back to:',
                    choices: remainingAccounts.map(email => ({
                        name: `👤 ${email}`,
                        value: email,
                    })),
                });
                activeAccountEmail = fallbackChoice;
                console.log(chalk.green(`\n✅ Active session successfully switched to: [${activeAccountEmail}]\n`));
            }
            break;
        }

        case 'user_me': {
            const res = await api.get('/users/me');
            console.log(chalk.cyan('\n--- User Profile Data ---'));
            console.dir(res.data, { depth: null, colors: true });
            console.log('');
            break;
        }

        case 'user_update': {
            const fieldToUpdate = await select({
                message: 'Select profile field to update:',
                choices: [
                { name: '👤 Name', value: 'name' },
                { name: '✉️  Email', value: 'email' },
                { name: '🔑 Password', value: 'password' },
                { name: '❌ Cancel', value: 'cancel' },
                ],
            });

            if (fieldToUpdate === 'cancel') {
                console.log(chalk.yellow('\nUpdate canceled.\n'));
                break;
            }

            const updateData = {};

            if (fieldToUpdate === 'name') {
                const name = await input({ message: 'Enter new name:' });
                if (!name.trim()) {
                    console.log(chalk.yellow('\n⚠️ Name cannot be empty. Aborting.\n'));
                    break;
                }
                updateData.name = name.trim();
            } else if (fieldToUpdate === 'email') {
                const email = await input({ message: 'Enter new email address:' });
                if (!email.trim()) {
                    console.log(chalk.yellow('\n⚠️ Email cannot be empty. Aborting.\n'));
                    break;
                }
                updateData.email = email.trim();
            } else if (fieldToUpdate === 'password') {
                const newPassword = await password({ message: 'Enter new password:', mask: '*' });
                if (!newPassword) {
                    console.log(chalk.yellow('\n⚠️ Password cannot be empty. Aborting.\n'));
                    break;
                }
                updateData.password = newPassword;
            }

            const res = await api.patch(
                '/users/me', 
                updateData
            );

            console.log(chalk.green(`\n✅ ${fieldToUpdate.toUpperCase()} updated successfully!`));
            console.dir(res.data, { depth: null, colors: true });
            console.log('');
            break;
        }

        case 'user_delete': {
            const confirm = await input({ message: 'Type "DELETE" to permanently remove your account:' });
            if (confirm === 'DELETE') {
                await api.delete('/users/me');
                if (activeAccountEmail) {
                    activeSessions.delete(activeAccountEmail);
                    activeAccountEmail = activeSessions.keys().next().value || null;
                }
                console.log(chalk.red('\n✅ Account permanently deleted. Session destroyed from memory.\n'));
            } else {
                console.log(chalk.yellow('\nCancellation acknowledged. Account intact.\n'));
            }
            break;
        }

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

            // Generate hybrid device identifier (e.g., "MacBook-Pro-7a8f9c")
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
            
            // Generate current machine's device identifier to pull this specific device's state
            const shortId = machineIdPkg.machineIdSync().slice(0, 6);
            const deviceIdentifier = `${os.hostname()}-${shortId}`;

            const res = await api.get(`/vault/pull/${type}/${workspace}?deviceId=${deviceIdentifier}`);
            console.log(chalk.cyan('\n📦 Received raw encrypted payload from server vault. Saving ciphertext locally...'));

            try {
                const responseData = res.data?.data || res.data;
                
                let subFolder = 'declarative';
                if (type === 'declarative_state') {
                    subFolder = 'declarative';
                } else if (type === 'dotfiles') {
                    subFolder = 'dotfiles';
                } else if (type === 'workspace_session') {
                    subFolder = 'workspace_session';
                }

                const snapshotsDir = path.join(process.cwd(), 'client', 'snapshots', activeAccountEmail, deviceIdentifier, subFolder);
                await fs.mkdir(snapshotsDir, { recursive: true });
                
                const timeSlug = dayjs().format('YYYY-MM-DD-HHmmss');
                const exportFilename = `stash-encrypted-${workspace}-${timeSlug}.json`;
                const exportPath = path.join(snapshotsDir, exportFilename);
                
                await fs.writeFile(exportPath, JSON.stringify(responseData, null, 2), 'utf8');

                console.log(chalk.green(`\n✅ Encrypted ciphertext successfully stored locally at: client/snapshots/${activeAccountEmail}/${deviceIdentifier}/${subFolder}/${exportFilename}\n`));
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

            const fileChoices = jsonFiles.map(file => {
                const readableName = file.replace('stash-encrypted-', '').replace('.json', '');
                return {
                    name: `📄 ${readableName}`,
                    value: file,
                };
            });

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
                console.log(chalk.green('✅ Session inspection complete. Plaintext data was held strictly in-memory and discarded. Returning to main menu.\n'));
            } catch (err) {
                console.log(chalk.red('\n❌ Decryption failed! Invalid master key password, mismatched user account context, or corrupted ciphertext.\n'));
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
            const type = await input({ message: 'Payload type:', default: 'declarative_state' });
            const workspace = await input({ message: 'Workspace name to purge:', default: 'default' });
            
            await api.delete(`/vault/${type}/${workspace}`);

            console.log(chalk.green(`\n✅ Snapshot [${type}/${workspace}] removed from vault.\n`));
            break;
        }
    }
}

function extractCookieToken(res) {
    const setCookie = res.headers['set-cookie'];
    if (setCookie && setCookie.length > 0) {
        const tokenMatch = setCookie[0].match(/token=([^;]+)/);
        if (tokenMatch && tokenMatch[1]) {
            return tokenMatch[1];
        }
    }
    return null;
}
