import input from '@inquirer/input';
import password from '@inquirer/password';
import select from '@inquirer/select';
import chalk from 'chalk';
import { api, activeSessions, getActiveAccount, setActiveAccount } from '../utils/context.js';

export async function handleUserAction(action) {
    let activeAccountEmail = getActiveAccount();

    switch (action) {
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

            if (fieldToUpdate === 'cancel') return;
            const updateData = {};

            if (fieldToUpdate === 'name') {
                updateData.name = (await input({ message: 'Enter new name:' })).trim();
            } else if (fieldToUpdate === 'email') {
                updateData.email = (await input({ message: 'Enter new email address:' })).trim();
            } else if (fieldToUpdate === 'password') {
                updateData.password = await password({ message: 'Enter new password:', mask: '*' });
            }

            const res = await api.patch('/users/me', updateData);
            console.log(chalk.green(`\n✅ ${fieldToUpdate.toUpperCase()} updated successfully!`));
            console.dir(res.data, { depth: null, colors: true });
            break;
        }
        case 'user_delete': {
            const confirm = await input({ message: 'Type "DELETE" to permanently remove your account:' });
            if (confirm === 'DELETE') {
                await api.delete('/users/me');
                if (activeAccountEmail) {
                    activeSessions.delete(activeAccountEmail);
                    setActiveAccount(activeSessions.keys().next().value || null);
                }
                console.log(chalk.red('\n✅ Account permanently deleted.\n'));
            } else {
                console.log(chalk.yellow('\nCancellation acknowledged.\n'));
            }
            break;
        }
    }
}
