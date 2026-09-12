import mongoose from "mongoose";

const vaultItemSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    ciphertext: {
        type: String,
        required: true,
    },
    iv: {
        type: String,
        required: true,
    },
    salt: {
        type: String,
        required: true,
    },
}, { timestamps: true });

const VaultItem = mongoose.model('VaultItem', vaultItemSchema);
export default VaultItem;