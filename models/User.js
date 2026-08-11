import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { ROLES, USER_STATUSES } from '../config/constants.js';

const UserSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true, index: true },
    organizationId: { type: String, default: null, index: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    passwordHash: { type: String, required: true },
    role: { 
        type: String, 
        enum: Object.values(ROLES), 
        default: ROLES.AGENT,
        index: true
    },
    status: {
        type: String,
        enum: Object.values(USER_STATUSES),
        default: USER_STATUSES.ACTIVE,
        index: true
    },
    lastLogin: { type: Date, default: null },
    deletedAt: { type: Date, default: null }
}, { timestamps: true });

UserSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.passwordHash);
};

UserSchema.statics.hashPassword = async function (password) {
    return await bcrypt.hash(password, 12);
};

UserSchema.index({ organizationId: 1, role: 1, status: 1 });

export default mongoose.models.User || mongoose.model('User', UserSchema);
