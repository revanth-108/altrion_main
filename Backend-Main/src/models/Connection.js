import mongoose from 'mongoose';

const connectionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    platformId: {
        type: String,
        required: true,
        trim: true
    },
    platformName: {
        type: String,
        required: true,
        trim: true
    },
    platformType: {
        type: String,
        enum: ['crypto', 'bank', 'broker'],
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'connected', 'failed', 'disconnected'],
        default: 'pending'
    },
    credentials: {
        // Encrypted credentials (if needed)
        // In production, use proper encryption
        encryptedData: String,
        lastVerified: Date
    },
    metadata: {
        accountNumber: String,
        accountName: String,
        walletAddress: String
    },
    lastSynced: {
        type: Date,
        default: null
    },
    syncEnabled: {
        type: Boolean,
        default: true
    },
    errorMessage: {
        type: String,
        default: null
    }
}, {
    timestamps: true
});

// Index for faster queries
connectionSchema.index({ userId: 1, platformId: 1 });

const Connection = mongoose.model('Connection', connectionSchema);

export default Connection;
