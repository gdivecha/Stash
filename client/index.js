import 'dotenv/config';
import readline from 'readline/promises';
import axios from 'axios';
import os from 'os';

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
} from './crypto.js';
import {
    SESSION_TOKEN,
} from '../providers/env.js';

const API_BASE_URL = 'http://localhost:4000/api/v1/vault';

async function startInteractiveCLI() {
    const rl = readline.createInterface({ 
        input, 
        output 
    });

    try {
        console.log('=== Vault CLI Interactive Session ===\n');
        console.log('1. Push extensions snapshot');
        console.log('2. Pull and decrypt snapshot\n');
        
        const choice = await rl.question('Select an option (1 or 2): ');

        let sessionToken = SESSION_TOKEN;
        if (!sessionToken) {
            sessionToken = await rl.question('Enter your session token: ');
        }
        
        if (!sessionToken) {
            throw new Error('SESSION_TOKEN is missing and was not provided.');
        }

        let secretKey;

        if (choice.trim() === '1') {
            secretKey = await rl.question('Enter your master password / encryption key (Remember this to decrypt later): ');
            const validationResult = validateMasterPassword(secretKey);
            if (!validationResult.isValid) {
                console.error(`\nValidation Error: ${validationResult.message}`);
                return;
            }

            console.log('\n[1/4] Scanning VS Code extensions...');
            const extensions = await scanVSCodeExtensions();
            console.log(`Found ${extensions.length} extensions.`);

            console.log('[2/4] Encrypting payload with crypto.js pipeline...');
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

            console.log('[3/4] Pushing snapshot to backend vault...');
            const response = await axios.post(`${API_BASE_URL}/push`, payloadToSend, {
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': `token=${sessionToken}`
                },
                withCredentials: true
            });

            console.log('\nSuccess! Vault response:', response.data);
        } else if (choice.trim() === '2') {
            secretKey = await rl.question('Enter your master password / encryption key (Must match the password used when pushing): ');
            const validationResult = validateMasterPassword(secretKey);
            if (!validationResult.isValid) {
                console.error(`\nValidation Error: ${validationResult.message}`);
                return;
            }

            console.log('\n[1/2] Fetching snapshot from backend vault...');
            const response = await axios.get(`${API_BASE_URL}/pull`, {
                headers: {
                    'Cookie': `token=${sessionToken}`
                },
                withCredentials: true
            });

            const vaultItem = response.data.data;
            const { ciphertext, iv, authTag, salt } = vaultItem.payload;

            console.log('[2/2] Decrypting payload using master password...');
            const decryptedData = decryptPayload({
                ciphertext,
                iv,
                authTag,
                salt
            }, secretKey);

            console.log('\nSuccess! Decrypted extensions snapshot:');
            console.log(`- Schema Version: ${vaultItem.schemaVersion}`);
            console.log(`- Workspace: ${vaultItem.metadata.workspaceName}`);
            console.log(`- Total Extensions Found: ${decryptedData.items.length}`);
            console.log('\nSample items:', decryptedData.items.slice(0, 3));
        } else {
            console.log('\nInvalid option selected.');
        }
    } catch (error) {
        console.error('\nInteractive execution failed:', error.response?.data || error.message);
    } finally {
        rl.close();
    }
}

startInteractiveCLI();