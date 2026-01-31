import mongoose from 'mongoose';

const assetSchema = new mongoose.Schema({
    portfolioId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Portfolio',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    symbol: {
        type: String,
        required: true,
        uppercase: true,
        trim: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    type: {
        type: String,
        enum: ['crypto', 'stock', 'stablecoin'],
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    value: {
        type: Number,
        required: true,
        min: 0
    },
    change24h: {
        type: Number,
        default: 0
    },
    platform: {
        type: String,
        required: true,
        trim: true
    },
    platformId: {
        type: String,
        trim: true
    },
    lastSynced: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Index for faster queries
assetSchema.index({ portfolioId: 1, symbol: 1 });
assetSchema.index({ userId: 1 });

// Calculate value before saving
assetSchema.pre('save', function (next) {
    this.value = this.amount * this.price;
    next();
});

const Asset = mongoose.model('Asset', assetSchema);

export default Asset;
