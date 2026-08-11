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
    } catch (err) {
        console.error('❌ MongoDB Atlas connection error:', err.message);
        throw err;
    }
}

export async function disconnectDB() {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
        console.log('✓ MongoDB connection closed.');
    }
}
