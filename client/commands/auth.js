import input from '@inquirer/input';
import password from '@inquirer/password';
import select from '@inquirer/select';
import chalk from 'chalk';
import { api, activeSessions, setSessionToken, extractCookieToken, getActiveAccount, setActiveAccount } from '../utils/context.js';

export async function handleAuthAction(action) {
    let activeAccountEmail = getActiveAccount();

    switch (action) {
        case 'auth_signup': {
            const name = await input({ message: 'Enter full name:' });
            const email = await input({ message: 'Enter email:' });
            const pass = await password({ message: 'Enter password:', mask: '*' });

            const res = await api.post('/auth/sign-up', { name, email, password: pass });
            const token = extractCookieToken(res);
            if (token) setSessionToken(token, email);
            console.log(chalk.green(`\n✅ Account created successfully and active session set for [${email}]!\n`));
            break;        
        }
        case 'auth_signin': {
            const email = await input({ message: 'Enter email:' });
            const pass = await password({ message: 'Enter password:', mask: '*' });

            const res = await api.post('/auth/sign-in', { email, password: pass });
            const token = extractCookieToken(res);
            if (token) setSessionToken(token, email);
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

            const selection = await select({ message: 'Account Management:', choices: subActionChoices });
            if (selection === 'cancel') return;

            if (selection === 'signin_another') {
                const email = await input({ message: 'Enter email to sign in:' });
                const pass = await password({ message: 'Enter password:', mask: '*' });
                const res = await api.post('/auth/sign-in', { email, password: pass });
                const token = extractCookieToken(res);
                if (token) setSessionToken(token, email);
                console.log(chalk.green(`\n✅ Signed in successfully! Active session switched to [${email}].\n`));
            } else if (selection === 'signup_another') {
                const name = await input({ message: 'Enter full name:' });
                const email = await input({ message: 'Enter email:' });
                const pass = await password({ message: 'Enter password:', mask: '*' });
                const res = await api.post('/auth/sign-up', { name, email, password: pass });
                const token = extractCookieToken(res);
                if (token) setSessionToken(token, email);
                console.log(chalk.green(`\n✅ Account created successfully and active session set to [${email}]!\n`));
            } else if (selection.startsWith('switch_')) {
                const targetEmail = selection.replace('switch_', '');
                setActiveAccount(targetEmail);
                console.log(chalk.green(`\n✅ Active session switched to: ${targetEmail}\n`));
            }
            break;
        }
        case 'auth_signout': {
            if (!activeAccountEmail) {
                console.log(chalk.yellow('\n⚠️ No active account to sign out from.\n'));
                return;
            }
            await api.post('/auth/sign-out').catch(() => {});
            activeSessions.delete(activeAccountEmail);
            console.log(chalk.yellow(`\n✅ Account [${activeAccountEmail}] signed out and removed from memory.`));

            const remainingAccounts = Array.from(activeSessions.keys());
            if (remainingAccounts.length === 0) {
                setActiveAccount(null);
            } else if (remainingAccounts.length === 1) {
                setActiveAccount(remainingAccounts[0]);
            } else {
                const fallbackChoice = await select({
                    message: 'Select an account to fall back to:',
                    choices: remainingAccounts.map(email => ({ name: `👤 ${email}`, value: email })),
                });
                setActiveAccount(fallbackChoice);
            }
            break;
        }
    }
}
