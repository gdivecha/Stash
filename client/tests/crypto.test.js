import { 
    encryptPayload,
    decryptPayload,
} from '../crypto.js';

function testCryptoPipeline() {
    try {
        console.log('Running encryption/decryption test...');

        const dummyData = {
            "~/.zshrc": "export PATH=$PATH:/usr/local/bin",
            "~/.config/nvim": "vim.opt.number = true",
        };
        const masterSecret = 'my-secure-master-password-123';

        console.log('Original Dummy Data:', dummyData);

        const bundle = encryptPayload(dummyData, masterSecret);
        console.log('✓ Encrypted successfully. Bundle generated:');
        console.log(`  - Ciphertext: ${bundle.ciphertext.slice(0, 40)}...`);
        console.log(`  - IV: ${bundle.iv}`);
        console.log(`  - Auth Tag: ${bundle.authTag}`);
        console.log(`  - Salt: ${bundle.salt}`);

        const recoveredData = decryptPayload(bundle, masterSecret);
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
