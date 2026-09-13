#!/usr/bin/env node

import 'dotenv/config';
import readline from 'readline/promises';
import axios from 'axios';
import os from 'os';
import { Command } from 'commander';
import { 
    stdin as input, 
    stdout as output 
} from 'process';
import { 
    scanVSCodeExtensions 
} from './scanners/vscode.js';
import { 
    validateMasterPassword
} from './utils/validator.js';
import { 
    encryptPayload,
    decryptPayload
} from './utils/crypto.js';
import {
    BACKEND_SERVER_URL,
    BACKEND_API_VERSION,
    SESSION_TOKEN,
} from '../env.js';

const API_BASE_URL = `${BACKEND_SERVER_URL}/${BACKEND_API_VERSION}/vault`;
const program = new Command();

async function promptForPassword(actionDescription) {
    const rl = readline.createInterface({ input, output });
    try {
        const secretKey = await rl.question(`Enter your master password / encryption key (${actionDescription}): `);
        const validationResult = validateMasterPassword(secretKey);
        if (!validationResult.isValid) {
            throw new Error(`Validation Error: ${validationResult.message}`);
        }
        return secretKey;
    } finally {
        rl.close();
    }
}

async function resolveSessionToken() {
    if (SESSION_TOKEN) return SESSION_TOKEN;
    const rl = readline.createInterface({ input, output });
    try {
        const token = await rl.question('Enter your session token: ');
        if (!token) throw new Error('SESSION_TOKEN is missing and was not provided.');
        return token.trim();
    } finally {
        rl.close();
    }
}

program
    .name('stash')
    .description('Encrypted CLI tool for syncing development state and extensions')
    .version('1.0.0');

program
    .command('push')
    .description('Scan, encrypt, and push your declarative state (VS Code extensions) to the backend vault')
    .action(async () => {
        try {
            const secretKey = await promptForPassword('Remember this to decrypt later');
            const sessionToken = await resolveSessionToken();

            console.log('\n[1/4] Scanning declarative state: VS Code extensions...');
            const extensions = await scanVSCodeExtensions();
            console.log(`Found ${extensions.length} extensions.`);

            console.log('[2/4] Encrypting declarative payload with crypto.js pipeline...');
            const rawPayload = {
                schemaVersion: "1.0.0",
                payloadType: "vscode_extensions",
                workspaceName: "default",
                items: extensions
            };

            const encryptedResult = encryptPayload(rawPayload, secretKey);

            const payloadToSend = {
                schemaVersion: "1.0.0",
                payload: {
                    ciphertext: encryptedResult.ciphertext,
                    iv: encryptedResult.iv,
                    authTag: encryptedResult.authTag,
                    salt: encryptedResult.salt
                },
                metadata: {
                    payloadType: "declarative_state",
                    workspaceName: "default",
                    device: {
                        deviceId: "macbook-pro-m3-pro",
                        hostname: os.hostname(),
                        platform: os.platform(),
                        arch: os.arch()
                    },
                    itemCount: extensions.length
                }
            };

            console.log('[3/4] Pushing declarative state snapshot to backend vault...');
            const response = await axios.post(`${API_BASE_URL}/push`, payloadToSend, {
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': `token=${sessionToken}`
                },
                withCredentials: true
            });

            console.log('\nSuccess! Declarative state synced. Vault response:', response.data);
        } catch (error) {
            console.error('\nPush failed:', error.response?.data || error.message);
            process.exit(1);
        }
    });

program
    .command('pull')
    .description('Fetch and decrypt your declarative state snapshot (VS Code extensions) from the vault')
    .argument('[type]', 'Payload type', 'declarative_state')
    .argument('[workspace]', 'Workspace name', 'default')
    .action(async (type, workspace) => {
        try {
            const secretKey = await promptForPassword('Must match the password used when pushing');
            const sessionToken = await resolveSessionToken();

            console.log(`\n[1/2] Fetching '${type}' snapshot for workspace '${workspace}' from backend vault...`);
            const response = await axios.get(`${API_BASE_URL}/pull/${type}/${workspace}`, {
                headers: {
                    'Cookie': `token=${sessionToken}`
                },
                withCredentials: true
            });

            const vaultItem = response.data.data;
            const { ciphertext, iv, authTag, salt } = vaultItem.payload;

            console.log('[2/2] Decrypting declarative state payload using master password...');
            const decryptedData = decryptPayload({
                ciphertext,
                iv,
                authTag,
                salt
            }, secretKey);

            console.log('\nSuccess! Decrypted declarative state (VS Code extensions):');
            console.log(`- Schema Version: ${vaultItem.schemaVersion}`);
            console.log(`- Workspace: ${vaultItem.metadata.workspaceName}`);
            console.log(`- Total Extensions Found: ${decryptedData.items.length}`);
            console.log('\nSample items:', decryptedData.items.slice(0, 3));
        } catch (error) {
            console.error('\nPull failed:', error.response?.data || error.message);
            process.exit(1);
        }
    });

program
    .command('delete')
    .description('Delete a specific workspace session snapshot from the vault')
    .argument('<workspace>', 'Workspace name to delete')
    .argument('[type]', 'Payload type', 'workspace_session')
    .action(async (workspace, type) => {
        try {
            const sessionToken = await resolveSessionToken();

            console.log(`\nDeleting snapshot for type '${type}' in workspace '${workspace}'...`);
            const response = await axios.delete(`${API_BASE_URL}/${type}/${workspace}`, {
                headers: {
                    'Cookie': `token=${sessionToken}`
                },
                withCredentials: true
            });

            console.log('\nSuccess:', response.data.message);
        } catch (error) {
            console.error('\nDeletion failed:', error.response?.data || error.message);
            process.exit(1);
        }
    });

program
    .command('summary')
    .description('Fetch a lightweight summary across all vault snapshot phases')
    .action(async () => {
        try {
            const sessionToken = await resolveSessionToken();

            console.log('\nFetching vault summary...');
            const response = await axios.get(`${API_BASE_URL}/summary`, {
                headers: {
                    'Cookie': `token=${sessionToken}`
                },
                withCredentials: true
            });

            console.log('\nVault Summary:');
            console.dir(response.data.data, { depth: null, colors: true });
        } catch (error) {
            console.error('\nSummary fetch failed:', error.response?.data || error.message);
            process.exit(1);
        }
    });

program
    .command('help')
    .description('Display detailed instructions and command guide for Stash CLI')
    .action(() => {
        console.log('\n\x1b[36m====================================================\x1b[0m');
        console.log('              \x1b[1mSTASH CLI - INSTRUCTIONS\x1b[0m              ');
        console.log('\x1b[36m====================================================\x1b[0m');
        console.log('Stash is an encrypted zero-knowledge development state');
        console.log('and extension syncing utility.\n');
        
        console.log('\x1b[1mAvailable Commands:\x1b[0m');
        console.log('  \x1b[32mpush\x1b[0m');
        console.log('    Scan, encrypt, and push your declarative state');
        console.log('    (VS Code extensions) to the backend vault.\n');
        
        console.log('  \x1b[32mpull\x1b[0m \x1b[90m[type] [workspace]\x1b[0m');
        console.log('    Fetch and decrypt a specific snapshot from the vault.');
        console.log('    \x1b[90mDefaults: type="declarative_state", workspace="default"\x1b[0m\n');
        
console.log('  \x1b[31mdelete\x1b[0m \x1b[1m<workspace>\x1b[0m \x1b[90m[type]\x1b[0m');
        console.log('    Delete a specific snapshot from the vault.');
        console.log('    \x1b[90m- <workspace>: Required target workspace name (e.g., my-workspace)\x1b[0m');
        console.log('    \x1b[90m- [type]: Optional payload type (Currently supported: "workspace_session")\x1b[0m');
        console.log('    \x1b[90m- Default: type="workspace_session" (automatically applied if omitted)\x1b[0m\n');        
        console.log('  \x1b[33msummary\x1b[0m');
        console.log('    Fetch a lightweight summary across all vault snapshots.\n');
        
        console.log('  \x1b[34mhelp\x1b[0m');
        console.log('    Display this command guide and instruction manual.');
        console.log('\x1b[36m====================================================\x1b[0m\n');
    });

program.parse(process.argv);
