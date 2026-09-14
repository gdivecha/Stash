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

let sessionCookie = '';

export const api = axios.create({
    baseURL: `${BACKEND_SERVER_URL}/${BACKEND_API_VERSION}`,
    withCredentials: true,
});

api.interceptors.request.use((config) => {
    if (sessionCookie) {
        config.headers.Cookie = `token=${sessionCookie}`;
    }
    return config;
});

export function setSessionToken(token) {
    sessionCookie = token;
}

export async function startInteractiveConsole() {
    console.clear();
    console.log(chalk.bold.cyan('========================================'));
    console.log(chalk.bold.cyan('      STASH INTERACTIVE MANAGEMENT      '));
    console.log(chalk.bold.cyan('========================================\n'));

    while (true) {
        const action = await select({
            message: 'Select an operation family',
            choices: [
                { 
                    name: '🔐 Auth: Sign Up', 
                    value: 'auth_signup',
                },
                { 
                    name: '🔑 Auth: Sign In', 
                    value: 'auth_signin',
                },
                { 
                    name: '🚪 Auth: Sign Out', 
                    value: 'auth_signout',
                },
                { 
                    name: '👤 User: Get Profile (Me)',
                    value: 'user_me',
                },
                { 
                    name: '✏️  User: Update Profile',
                    value: 'user_update',
                },
                { 
                    name: '⚠️  User: Delete Account', 
                    value: 'user_delete',
                },
                { 
                    name: '📦 Vault: Push Encrypted Snapshot', 
                    value: 'vault_push',
                },
                { 
                    name: '📥 Vault: Pull & Decrypt Snapshot', 
                    value: 'vault_pull',
                },
                { 
                    name: '📊 Vault: Summary',
                    value: 'vault_summary',
                },
                { 
                    name: '🗑️  Vault: Delete Snapshot', 
                    value: 'vault_delete',
                },
                { 
                    name: '❌ Exit Console', 
                    value: 'exit',
                },
            ],
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

            captureCookie(res);
            console.log(chalk.green('\n✅ Account created successfully! Session initialized.\n'));
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

            captureCookie(res);
            console.log(chalk.green('\n✅ Signed in successfully! Session updated.\n'));
            break;
        }

        case 'auth_signout': {
            await api.post('/auth/sign-out');
            sessionCookie = '';
            console.log(chalk.yellow('\n✅ Signed out successfully. Session cleared.\n'));
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
                sessionCookie = '';
                console.log(chalk.red('\n✅ Account permanently deleted. Session destroyed.\n'));
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

            const encrypted = encryptPayload(snapshotData, masterSecret);

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
                        deviceId: machineIdPkg.machineIdSync(),
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
            const type = await input({ message: 'Payload type:', default: 'declarative_state' });
            const workspace = await input({ message: 'Workspace name:', default: 'default' });
            
            const res = await api.get(`/vault/pull/${type}/${workspace}`);
            console.log(chalk.cyan('\n📦 Received raw encrypted payload from server vault.'));

            const masterSecret = await password({ 
                message: 'Enter master key password to decrypt:', 
                mask: '*'
            });

            try {
                const responseData = res.data?.data || res.data;
                const rawPayload = responseData?.payload || responseData;

                const decryptedObj = decryptPayload(rawPayload, masterSecret);
                
                let subFolder = 'workspaces';
                if (type === 'declarative_state') {
                    subFolder = 'declarative';
                } else if (type === 'dotfiles') {
                    subFolder = 'dotfiles';
                }

                const snapshotsDir = path.join(process.cwd(), 'client', 'snapshots', subFolder);
                await fs.mkdir(snapshotsDir, { recursive: true });
                
                const timeSlug = dayjs().format('YYYY-MM-DD-HHmmss');
                const exportFilename = `stash-export-${workspace}-${timeSlug}.json`;
                const exportPath = path.join(snapshotsDir, exportFilename);
                
                await fs.writeFile(exportPath, JSON.stringify(decryptedObj, null, 2), 'utf8');

                console.log(chalk.green(`\n✅ Decryption verified! Snapshot exported locally to: client/snapshots/${subFolder}/${exportFilename}\n`));
            } catch (err) {
                console.log(chalk.red('\n❌ Decryption failed! Invalid master key password or payload was tampered with.\n'));
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

function captureCookie(res) {
    const setCookie = res.headers['set-cookie'];
    if (setCookie && setCookie.length > 0) {
        const tokenMatch = setCookie[0].match(/token=([^;]+)/);
        if (tokenMatch && tokenMatch[1]) {
            sessionCookie = tokenMatch[1];
        }
    }
}
