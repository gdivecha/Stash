import { 
    encryptPayload,
    decryptPayload,
} from '../utils/crypto.js';

function testCryptoPipeline() {
    try {
        console.log('Running encryption/decryption test...');

        const dummyData = {
            "~/.zshrc": "export PATH=$PATH:/usr/local/bin",
            "~/.config/nvim": "vim.opt.number = true",
        };
        const masterSecret = 'my-secure-master-password-123';
        const userEmail = 'gaurav@example.com';

        console.log('Original Dummy Data:', dummyData);
        console.log(`User Context: ${userEmail}`);

        const bundle = encryptPayload(dummyData, masterSecret, userEmail);
        console.log('✓ Encrypted successfully. Bundle generated:');
        console.log(`  - Ciphertext: ${bundle.ciphertext.slice(0, 40)}...`);
        console.log(`  - IV: ${bundle.iv}`);
        console.log(`  - Auth Tag: ${bundle.authTag}`);
        console.log(`  - Salt: ${bundle.salt}`);

        const recoveredData = decryptPayload(bundle, masterSecret, userEmail);
        console.log('✓ Decrypted successfully:', recoveredData);

        if (JSON.stringify(dummyData) === JSON.stringify(recoveredData)) {
            console.log('\nSuccess: Decrypted payload matches original dummy data perfectly!');
        } 
        else {
            console.error('\nError: Decrypted payload does not match original data.');
        }
    } catch (error) {
        console.error('Crypto test failed:', error.message);
    }
}

testCryptoPipeline();
