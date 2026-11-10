const { randomBytes, createHash } = require("crypto");

const generateToken = () => randomBytes(48).toString("base64url");
const hashToken = (token) => createHash("sha256").update(token).digest("hex");

module.exports = { generateToken, hashToken };
