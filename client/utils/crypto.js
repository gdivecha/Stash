import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;              // 256 bits
const IV_LENGTH = 12;               // 96 bits recommended for GCM

/**
 * Derives a deterministic 32-byte binary key bound to both the master secret, 
 * the per-payload random salt, and the specific user's email using 
 * scrypt parameters optimized for memory-constrained environments.
 */
function deriveKey(secret, salt, userEmail) {
    const emailBuffer = Buffer.from(userEmail, 'utf8');
    const combinedSalt = Buffer.concat([emailBuffer, salt]);

    return crypto.scryptSync(
        secret,
        combinedSalt,
        KEY_LENGTH,
        {
            N: 16384, // Optimized memory/CPU cost factor for constrained VMs (2^14)
            r: 8,     // Block size
            p: 1      // Parallelization factor
        }
    );
}

/**
 * Derives a portable key using ONLY the secret and salt (for sharable exports).
 */
function deriveSharableKey(secret, salt) {
    return crypto.scryptSync(
        secret,
        salt,
        KEY_LENGTH,
        {
            N: 16384,
            r: 8,
            p: 1
        }
    );
}

export function encryptPayload(dataObj, masterSecret, userEmail) {
    const salt = crypto.randomBytes(16);                    // Generate a 16-byte random salt buffer
    const key = deriveKey(masterSecret, salt, userEmail);    // Bind key to userEmail + password + salt
    
    // Generates a 12-byte initialization vector (nonce) to prevent replay/pattern analysis attacks
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(
        ALGORITHM,
        key,
        iv
    );

    const plaintext = JSON.stringify(dataObj);

    let ciphertext = cipher.update( 
        plaintext, 
        'utf8', 
        'hex'
    );
    ciphertext += cipher.final('hex');

    // Generates a GCM auth tag binding the ciphertext, IV, and key together
    const authTag = cipher.getAuthTag().toString('hex');

    return {
        ciphertext,
        iv: iv.toString('hex'),
        authTag,
        salt: salt.toString('hex')
    };
}

export function decryptPayload(payload, masterSecret, userEmail) {
    const salt = Buffer.from(payload.salt, 'hex');          
    const key = deriveKey(masterSecret, salt, userEmail);   // Must use the exact same userEmail context to derive the correct key

    const decipher = crypto.createDecipheriv(
        ALGORITHM, 
        key, 
        Buffer.from(payload.iv, 'hex')    
    );

    decipher.setAuthTag(Buffer.from(
        payload.authTag, 
        'hex'
    ));

    let decrypted = decipher.update(
        payload.ciphertext, 
        'hex', 
        'utf8'
    );

    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
}

// ==========================================
// NEW: Sharable & Signature Extensions
// ==========================================

export function encryptSharablePayload(envelopeData, sharedPassword) {
    const salt = crypto.randomBytes(16);
    const key = deriveSharableKey(sharedPassword, salt);
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const plaintext = JSON.stringify(envelopeData);

    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return {
        ciphertext,
        iv: iv.toString('hex'),
        authTag,
        salt: salt.toString('hex')
    };
}

export function decryptSharablePayload(payload, sharedPassword) {
    const salt = Buffer.from(payload.salt, 'hex');
    const key = deriveSharableKey(sharedPassword, salt);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(payload.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(payload.authTag, 'hex'));

    let decrypted = decipher.update(payload.ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
}

export function signData(dataObj, privateKeyPem) {
    const dataString = JSON.stringify(dataObj);
    const signature = crypto.sign(null, Buffer.from(dataString), crypto.createPrivateKey(privateKeyPem));
    const publicKey = crypto.createPublicKey(privateKeyPem).export({ type: 'spki', format: 'pem' });
    
    return {
        signature: signature.toString('hex'),
        publicKey
    };
}

export function verifySignature(dataObj, signatureHex, publicKeyPem) {
    const dataString = JSON.stringify(dataObj);
    return crypto.verify(
        null, 
        Buffer.from(dataString), 
        crypto.createPublicKey(publicKeyPem), 
        Buffer.from(signatureHex, 'hex')
    );
}
