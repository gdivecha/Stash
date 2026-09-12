export function validateMasterPassword(password) {
    if (!password || typeof password !== 'string') {
        return {
            isValid: false,
            message: 'Master password is required',
        }
    }

    if (password.length < 12) {
        return {
            isValid: false,
            message: 'Master password must be at least 12 characters long',
        }
    }

    // Check character diversity to ensure basic entropy
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasDigit = /\d/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);

    const varietyCount = [hasLower, hasUpper, hasDigit, hasSpecial].filter(Boolean).length;

    // Require at least 3 out of 4 character classes
    if (varietyCount < 3) {
        return {
            isValid: false,
            message: 'Master password must include a mix of uppercase, lowercase, numbers, and special characters',
        };
    }

    return { 
        isValid: true, 
        message: 'Password meets security standards',
    };
}