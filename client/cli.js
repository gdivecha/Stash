#!/usr/bin/env node

import { Command } from 'commander';
import { startInteractiveConsole } from './utils/interactive.js';
import { handleAuthAction } from './commands/auth.js';
import { handleUserAction } from './commands/user.js';
import { handleVaultAction } from './commands/vault.js';

const program = new Command();

program
    .name('stash')
    .description('Encrypted zero-knowledge CLI tool for developer state synchronization')
    .version('1.0.0');

// Interactive Console Mode
program
    .command('console')
    .alias('i')
    .description('Launch interactive administration menu')
    .action(startInteractiveConsole);

// Auth Commands
program
    .command('signup')
    .description('Sign up a new account')
    .action(() => handleAuthAction('auth_signup'));

program
    .command('signin')
    .description('Sign in to account session')
    .action(() => handleAuthAction('auth_signin'));

program
    .command('signout')
    .description('Sign out and destroy session')
    .action(() => handleAuthAction('auth_signout'));

// Profile Commands
program
    .command('me')
    .description('Get current user profile')
    .action(() => handleUserAction('user_me'));

program
    .command('update-user')
    .description('Update user profile details')
    .action(() => handleUserAction('user_update'));

// Vault Commands
program
    .command('push')
    .description('Encrypt and push payload to vault')
    .action(() => handleVaultAction('vault_push'));

program
    .command('pull')
    .description('Pull and store encrypted payload ciphertext locally')
    .action(() => handleVaultAction('vault_pull'));

program
    .command('view')
    .description('Interactively select and view decrypted contents of local snapshots in-memory')
    .action(() => handleVaultAction('vault_view'));

program
    .command('summary')
    .description('Display vault summary')
    .action(() => handleVaultAction('vault_summary'));

program
    .command('delete')
    .description('Delete a snapshot from vault')
    .action(() => handleVaultAction('vault_delete'));

// Default to interactive console when run without arguments
if (!process.argv.slice(2).length) {
    startInteractiveConsole();
} else {
    program.parse(process.argv);
}
