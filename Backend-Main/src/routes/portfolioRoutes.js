import express from 'express';
import Portfolio from '../models/Portfolio.js';
import Asset from '../models/Asset.js';

const router = express.Router();

// Get user's portfolio
router.get('/', async (req, res) => {
    try {
        // In production, get userId from authenticated session
        // For now, we'll use a mock or query parameter
        const userId = req.query.userId || req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        let portfolio = await Portfolio.findOne({ userId });

        // Create portfolio if it doesn't exist
        if (!portfolio) {
            portfolio = await Portfolio.create({ userId });
        }

        // Get all assets for this portfolio
        const assets = await Asset.find({ portfolioId: portfolio._id });

        res.json({
            success: true,
            data: {
                portfolio: {
                    totalValue: portfolio.totalValue,
                    change24h: portfolio.change24h,
                    lastUpdated: portfolio.lastUpdated
                },
                assets
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Add asset to portfolio
router.post('/assets', async (req, res) => {
    try {
        const userId = req.query.userId || req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        let portfolio = await Portfolio.findOne({ userId });

        if (!portfolio) {
            portfolio = await Portfolio.create({ userId });
        }

        const asset = await Asset.create({
            ...req.body,
            portfolioId: portfolio._id,
            userId
        });

        // Recalculate portfolio total
        await portfolio.calculateTotalValue();

        res.status(201).json({
            success: true,
            data: asset
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// Update asset
router.put('/assets/:id', async (req, res) => {
    try {
        const asset = await Asset.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        if (!asset) {
            return res.status(404).json({
                success: false,
                message: 'Asset not found'
            });
        }

        // Recalculate portfolio total
        const portfolio = await Portfolio.findById(asset.portfolioId);
        await portfolio.calculateTotalValue();

        res.json({
            success: true,
            data: asset
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// Delete asset
router.delete('/assets/:id', async (req, res) => {
    try {
        const asset = await Asset.findByIdAndDelete(req.params.id);

        if (!asset) {
            return res.status(404).json({
                success: false,
                message: 'Asset not found'
            });
        }

        // Recalculate portfolio total
        const portfolio = await Portfolio.findById(asset.portfolioId);
        await portfolio.calculateTotalValue();

        res.json({
            success: true,
            message: 'Asset deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

export default router;
