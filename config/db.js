import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDB() {
    if (mongoose.connection.readyState >= 1) return;

    try {
        await mongoose.connect(env.MONGODB_URI, {
            autoIndex: true,
            serverSelectionTimeoutMS: 5000
        });
        console.log('✓ Connected to MongoDB Atlas Cloud Database!');
        await runMigrations();
    } catch (err) {
        console.error('❌ MongoDB Atlas connection error:', err.message);
        throw err;
    }
}

/**
 * One-time index migrations. Drops stale indexes left over from old schema
 * versions that conflict with the current schema.
 */
async function runMigrations() {
    try {
        const callLogCollection = mongoose.connection.collection('calllogs');
        const indexes = await callLogCollection.indexes();

        // Drop the legacy snake_case `call_sid_1` unique index.
        // The current schema uses camelCase `callSid`. Having this old index
        // causes E11000 duplicate key errors when multiple documents have call_sid: null.
        const hasLegacyIndex = indexes.some(idx => idx.name === 'call_sid_1');
        if (hasLegacyIndex) {
            await callLogCollection.dropIndex('call_sid_1');
            console.log('✓ [Migration] Dropped stale index call_sid_1 from calllogs.');
        }
    } catch (err) {
        if (err.codeName !== 'IndexNotFound') {
            console.warn('⚠️ [Migration] runMigrations warning:', err.message);
        }
    }
}

export async function disconnectDB() {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
        console.log('✓ MongoDB connection closed.');
    }
}
