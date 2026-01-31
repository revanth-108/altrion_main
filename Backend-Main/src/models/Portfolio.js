import mongoose from 'mongoose';

const portfolioSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    totalValue: {
        type: Number,
        default: 0
    },
    change24h: {
        type: Number,
        default: 0
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Update totalValue whenever assets change
portfolioSchema.methods.calculateTotalValue = async function () {
    const Asset = mongoose.model('Asset');
    const assets = await Asset.find({ portfolioId: this._id });

    this.totalValue = assets.reduce((sum, asset) => sum + asset.value, 0);
    await this.save();

    return this.totalValue;
};

const Portfolio = mongoose.model('Portfolio', portfolioSchema);

export default Portfolio;
