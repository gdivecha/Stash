import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;              // 256 bits - AES is usually 256 bits anyways if you remember Cybersecurity courses
const IV_LENGTH = 12;               // 96 bits recommended for GCM (Galios COunter Mode whihc provides confidentiality and integrity)

/**
 * - Master secret:
 *   - Password/passphrase the user inputs via the CLI or config
 *   - Never leaves the machine
 * - Salt:
 *   - Random value with 16 random bytes generated fresh for every snapshot
 *   - 2 snapshots wiht the same password will produce completely different keys and ciphertexts
 * - deriveKey:
 *   - Takes master secret and dynamic salt and outputs a deterministic 32-byte binary key required by aes-256-gcm
 */

function deriveKey(secret, salt) {                          // salt parameter so key derivation uses the per-payload salt buffer
    // Here, we want to transform a human-readavle master password into a cryptographically secure 32 byte binary key
    return crypto.scryptSync(
        secret,
        salt,
        KEY_LENGTH
    );
}

export function encryptPayload(dataObj, masterSecret) {
    const salt = crypto.randomBytes(16);                    // Generate a real 16-byte random salt buffer for scrypt
    const key = deriveKey(masterSecret, salt);
    
    // - Generates a 12-byte initialization vector (nonce) which if you remember in the cybersecurity course
    //   a nonce is a random value that is sent during the handshake between 2 parties to confirm that
    //   the parties are communicating in real time and someone isn't using pattern analysis to trigger a replay attack
    // - Basically: Makes it so that identical input data never produces the same ciphertext
    const iv = crypto.randomBytes(IV_LENGTH);

    // Creates the actual cipher with AES algorithm, newly generated key(based on current secret) and the nonce
    const cipher = crypto.createCipheriv(
        ALGORITHM,
        key,
        iv
    );

    const plaintext = JSON.stringify(dataObj);

    // Feeds the UTF-8 plaintext string into the active cipher block-by-block, converting the incoming bytes into hexadecimal ciphertext
    let ciphertext = cipher.update( 
        plaintext, 
        'utf8', 
        'hex'
    );

    // Flushes any remaining buffered data out of the cipher to complete the transformation process and finalize the encrypted string.
    ciphertext += cipher.final('hex');

    // - Generates a checksum or GCM auth tag that binds the ciphertext and IV together
    // - If anyone modifies even a single bit of the encrypted payload in transit or on the server, this tag will
    //   fail verification during decryption
    const authTag = cipher.getAuthTag().toString('hex');

    // Packages non-secret parameters like the nonce, authtag and the ciphertext
    return {
        ciphertext,
        iv: iv.toString('hex'),
        authTag,
        salt: salt.toString('hex')
    };
}

export function decryptPayload(payload, masterSecret) {
    const salt = Buffer.from(payload.salt, 'hex');          // Convert stored hex salt back into a binary Buffer for key derivation
    const key = deriveKey(masterSecret, salt);

    // Requires aes algo, derived key and original iv converted from its stored hex string back into a binary Buffer
    const decipher = crypto.createDecipheriv(
        ALGORITHM, 
        key, 
        Buffer.from(payload.iv, 'hex')    
    );

    // - Attaches GCM auth tag to the decipher after converting it back from hex to binary buffer
    // - GCM mode requires this tag before any decryption occurs
    // - If ciphertext or IV was modified even slightly on the server or in transit, verification fails
    decipher.setAuthTag(Buffer.from(
        payload.authTag, 
        'hex'
    ));

    let decrypted = decipher.update(
        payload.ciphertext, 
        'hex', 
        'utf8'
    );

    // Flushes any remaining bytes out of the decryption buffer to complete the reconstruction of the full plaintext string.
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
}
