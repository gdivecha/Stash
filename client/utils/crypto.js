import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;              // 256 bits
const IV_LENGTH = 12;               // 96 bits recommended for GCM

/**
 * Derives a deterministic 32-byte binary key bound to both the master secret, 
 * the per-payload random salt, and the specific user's email.
 */
function deriveKey(secret, salt, userEmail) {
    // Cryptographically bind the user's email into the salt buffer so the key 
    // cannot be derived under any other user account, even with the correct password.
    const emailBuffer = Buffer.from(userEmail, 'utf8');
    const combinedSalt = Buffer.concat([emailBuffer, salt]);

    return crypto.scryptSync(
        secret,
        combinedSalt,
        KEY_LENGTH
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
