import User from "../models/user.model.js";
import dayjs from 'dayjs';

export const getUserProfile = async (req, res, next) => {
    try {
        res.status(200).json({
            success: true,
            data: {
                user: req.user,
            },
        });
    } catch (error) {
        next(error);
    }
};

export const updateUserInfo = async (req, res, next) => {
    try {
        const {
            name, 
            email,
            currentPassword, 
            newPassword,
        } = req.body;

        const user = await User.findById(req.user._id).select('+password');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        if (newPassword) {
            if (!currentPassword) {
                return res.status(400).json({
                    success: false,
                    message: 'Please provide your current password to update it',
                });
            }

            const isMatch = await user.comparePassword(currentPassword);

            if (!isMatch) {
                return res.status(401).json({
                    success: false,
                    message: 'Incorrect current password',
                });
            }

            user.password = newPassword;
        }

        if (name)
            user.name = name;
        if (email)
            user.email = email;

        await user.save();

        user.password = undefined;

        res.status(200).json({
            success: true,
            data: {
                user,
            },
        });
    } catch (error) {
        next(error);
    }
};

export const deleteUser = async (req, res, next) => {
    try {
        await User.findByIdAndDelete(req.user._id);

        res.cookie(
            'token',
            'loggedout',
            {
                expires: dayjs().add(10, 'seconds').toDate(),
                httpOnly: true,
            },
        );

        res.status(200).json({
            success: true,
            message: 'User account deleted successfully',
        });
    } catch (error) {
        next(error);
    }
};
