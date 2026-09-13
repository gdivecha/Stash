import mongoose from "mongoose";
import bcrypt from 'bcrypt';

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [
            true,
            'Name is required'
        ],
        trim: true,
        minlength: [
            2, 
            'Name must be at least 2 characters long'
        ], 
        maxlength: [
            64, 
            'Name cannot exceed 64 characters'
        ], 
        match: [
            /^[a-zA-Z\s'-]+$/, 
            'Name can only contain alphabetic characters, spaces, hyphens, and apostrophes.'
        ],
    },
    email: {
        type: String,
        required: [
            true,
            'Email is required'
        ],
        unique: true,
        lowercase: true,
        trim: true,
        maxlength: [
            254, 
            'Email cannot exceed 254 characters'
        ],
        match: [
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/, 
            'Please provide a valid email address'
        ],
    },
    password: {
        type: String,
        required: [
            true,
            'Password is required'
        ],
        minlength: [
            8, 
            'Password must be at least 8 characters long'
        ],
        maxlength: [
            1024, 
            'Password hash cannot exceed 1024 characters'
        ],
        select: false,
    }
}, { timestamps: true });

userSchema.pre('save', async function(next) {
    if (!this.isModified('password'))
        return next();

    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);
export default User;
