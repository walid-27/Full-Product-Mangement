const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { randomUUID } = require("crypto");
const Auth = require("../models/Auth");
const Organization = require("../models/Organization");
const Membership = require("../models/Membership");
const AppError = require("../utils/AppError");
const Audit = require("./Audit.Service");

const signAccessToken = (user, organizationId = null) => jwt.sign({
    userId: user._id.toString(),
    email: user.email,
    ...(organizationId ? { orgId: organizationId.toString() } : {})
}, process.env.SECRET_JWT, { expiresIn: "12h" });

const register = async (data) => {
    const { name, email, password } = data;
    const existingUser = await Auth.findOne({ email });
    if (existingUser) throw new AppError("Unable to register with these details", 409, "USER_EXISTS");

    const hashPassword = await bcrypt.hash(password, 10);
    const session = await mongoose.startSession();
    try {
        return await session.withTransaction(async () => {
            const [user] = await Auth.create([{ name, email, password: hashPassword }], { session });
            const [organization] = await Organization.create([{
                name: `${name}'s Organization`,
                slug: `org-${randomUUID()}`
            }], { session });
            const [membership] = await Membership.create([{
                user: user._id,
                organization: organization._id,
                role: "owner",
                status: "active"
            }], { session });
            await Audit.record({
                organization: organization._id, actor: user._id, action: "organization.create",
                entity: "organization", entityId: organization._id, after: organization
            }, session);
            await Audit.record({
                organization: organization._id, actor: user._id, action: "team.owner.create",
                entity: "membership", entityId: membership._id, after: membership
            }, session);

            return {
                name: user.name,
                email: user.email,
                organization: { id: organization._id, name: organization.name, slug: organization.slug },
                token: signAccessToken(user, organization._id)
            };
        });
    } finally {
        await session.endSession();
    }
};

const login = async (data) => {
    const { email, password } = data;
    const user = await Auth.findOne({ email });
    if (!user || !await bcrypt.compare(password, user.password)) {
        throw new AppError("The email or password is invalid", 401, "INVALID_CREDENTIALS");
    }

    const membership = await Membership.findOne({ user: user._id, status: "active" })
        .sort({ createdAt: 1 })
        .lean();

    return {
        name: user.name,
        email: user.email,
        token: signAccessToken(user, membership?.organization)
    };
};

module.exports = { register, login, signAccessToken };
