import VaultItem from "../models/vault.model.js";

export const createVaultItem = async (req, res, next) => {
    try {
        const {
            ciphertext,
            iv,
            salt,
        } = req.body;

        const item = await VaultItem.create({
            user: req.user._id,
            ciphertext,
            iv,
            salt,
        });

        res.status(201).json({
            success: true,
            data: {
                item,
            },
        })
    } catch (error) {
        next(error);
    }
};

export const getVaultItems = async (req, res, next) => {
    try {
        const vaultItem = await VaultItem.findOne({
            user: req.user._id,
        });

        if (!vaultItem) {
            return res.status(404).json({
                success: false,
                message: 'No vault snapshot found for this user',
            });
        }

        res.status(200).json({
            success: true,
            data: vaultItem,
        });
    } catch (error) {
        next(error);
    }
};
