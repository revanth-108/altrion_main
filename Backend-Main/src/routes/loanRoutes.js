import express from 'express';
import Loan from '../models/Loan.js';
import Portfolio from '../models/Portfolio.js';
import Asset from '../models/Asset.js';

const router = express.Router();

// Get user's loans
router.get('/', async (req, res) => {
    try {
        const userId = req.query.userId || req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        const loans = await Loan.find({ userId })
            .populate('collateralAssets.assetId')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            data: loans
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get loan eligibility
router.get('/eligibility', async (req, res) => {
    try {
        const userId = req.query.userId || req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        const portfolio = await Portfolio.findOne({ userId });

        if (!portfolio) {
            return res.json({
                success: true,
                data: {
                    maxLoanAmount: 0,
                    currentLTV: 0,
                    maxLTV: 60,
                    eligibleCollateral: 0,
                    riskScore: 0,
                    riskLevel: 'N/A'
                }
            });
        }

        // Calculate eligibility
        const maxLTV = 60; // 60% loan-to-value ratio
        const eligibleCollateral = portfolio.totalValue;
        const maxLoanAmount = eligibleCollateral * (maxLTV / 100);

        // Calculate risk score (simplified)
        const assets = await Asset.find({ portfolioId: portfolio._id });
        const diversification = new Set(assets.map(a => a.type)).size;
        const riskScore = Math.min(100, 50 + (diversification * 10));

        let riskLevel = 'Medium';
        if (riskScore >= 70) riskLevel = 'Low';
        if (riskScore < 50) riskLevel = 'High';

        res.json({
            success: true,
            data: {
                maxLoanAmount,
                currentLTV: 0,
                maxLTV,
                eligibleCollateral,
                riskScore,
                riskLevel
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Apply for loan
router.post('/apply', async (req, res) => {
    try {
        const userId = req.query.userId || req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        const portfolio = await Portfolio.findOne({ userId });

        if (!portfolio) {
            return res.status(400).json({
                success: false,
                message: 'Portfolio not found'
            });
        }

        const loan = await Loan.create({
            ...req.body,
            userId,
            portfolioId: portfolio._id
        });

        // Calculate payments
        loan.calculatePayments();
        await loan.save();

        res.status(201).json({
            success: true,
            data: loan
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// Get loan by ID
router.get('/:id', async (req, res) => {
    try {
        const loan = await Loan.findById(req.params.id)
            .populate('collateralAssets.assetId');

        if (!loan) {
            return res.status(404).json({
                success: false,
                message: 'Loan not found'
            });
        }

        res.json({
            success: true,
            data: loan
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

export default router;
