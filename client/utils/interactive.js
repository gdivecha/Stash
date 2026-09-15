import select from '@inquirer/select';
import chalk from 'chalk';
import { getActiveAccount } from './context.js';
import { handleAuthAction } from '../commands/auth.js';
import { handleUserAction } from '../commands/user.js';
import { handleVaultAction } from '../commands/vault.js';

export async function startInteractiveConsole() {
    console.clear();
    console.log(chalk.bold.cyan('========================================'));
    console.log(chalk.bold.cyan('      STASH INTERACTIVE MANAGEMENT      '));
    console.log(chalk.bold.cyan('========================================\n'));

    while (true) {
        const activeAccountEmail = getActiveAccount();
        const accountHeader = activeAccountEmail 
            ? chalk.green(`[Active Account: ${activeAccountEmail}]`) 
            : chalk.yellow('[No Active Account]');
        
        console.log(accountHeader);

        const choices = [];

        if (!activeAccountEmail) {
            choices.push(
                { name: '🔐 Auth: Sign Up', value: 'auth_signup' },
                { name: '🔑 Auth: Sign In', value: 'auth_signin' },
                { name: '📂 Vault: View Local Snapshots (Offline)', value: 'vault_view_offline' }
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
                { name: '📂 Vault: View Local Snapshots (Offline)', value: 'vault_view_offline' },
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
            if (action.startsWith('auth_')) {
                await handleAuthAction(action);
            } else if (action.startsWith('user_')) {
                await handleUserAction(action);
            } else if (action.startsWith('vault_')) {
                await handleVaultAction(action);
            }
        } catch (err) {
            const errMsg = err.response?.data?.message 
                            || err.response?.data?.error 
                            || err.message;     
            console.log(chalk.red(`\n❌ Error [${err.response?.status || 500}]: ${errMsg}\n`));
        }
    }
}
