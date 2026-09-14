import select from '@inquirer/select';
import input from '@inquirer/input';
import password from '@inquirer/password';
import axios from 'axios';
import chalk from 'chalk';
import os from 'os';

import machineIdPkg from 'node-machine-id';

import { 
    scanVSCodeExtensions,
} from '../scanners/vscode.js';
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

            console.log(chalk.cyan('\n🔍 Scanning VS Code extensions...'));
            const extensions = await scanVSCodeExtensions();

            const masterSecret = await password({ 
                message: 'Enter master key password to encrypt:', 
                mask: '*' 
            });

            const snapshotData = {
                workspace,
                timestamp: new Date().toISOString(),
                vscode: {
                    extensions,
                },
            };

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
                    itemCount: extensions.length,
                },
            };

            const res = await api.post('/vault/push', payloadBody);
            console.log(chalk.green(`\n✅ Encrypted ${extensions.length} VS Code extensions and pushed to vault!`));
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
                // Safely extract ciphertext payload regardless of API wrapper depth
                const responseData = res.data?.data || res.data;
                const rawPayload = responseData?.payload || responseData;

                const decryptedObj = decryptPayload(rawPayload, masterSecret);
                
                console.log(chalk.green('\n✅ Decryption verified! Decrypted workspace snapshot:'));
                console.dir(decryptedObj, { depth: null, colors: true });
                console.log('');
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
