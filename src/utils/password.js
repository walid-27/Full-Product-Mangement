const COMMON_PASSWORDS = new Set([
    "password", "password1", "password123", "password1234", "12345678", "123456789",
    "1234567890", "qwerty123", "qwertyuiop", "letmein123", "welcome123", "admin123",
    "iloveyou", "abc123456", "changeme123", "dragon123", "football1", "monkey123"
]);

const getPasswordErrors = (password) => {
    const errors = [];
    if (typeof password !== "string" || password.length < 12) errors.push("at least 12 characters");
    if (typeof password === "string" && password.length > 72) errors.push("at most 72 characters");
    if (!/[a-z]/.test(password)) errors.push("a lowercase letter");
    if (!/[A-Z]/.test(password)) errors.push("an uppercase letter");
    if (!/\d/.test(password)) errors.push("a number");
    if (COMMON_PASSWORDS.has(password.toLowerCase())) errors.push("a password that is not commonly used");
    return errors;
};

module.exports = { COMMON_PASSWORDS, getPasswordErrors };
