import express from 'express';
import Connection from '../models/Connection.js';

const router = express.Router();

// Get user's connections
router.get('/', async (req, res) => {
    try {
        const userId = req.query.userId || req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        const connections = await Connection.find({ userId });

        res.json({
            success: true,
            data: connections
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Add new connection
router.post('/', async (req, res) => {
    try {
        const userId = req.query.userId || req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        const connection = await Connection.create({
            ...req.body,
            userId
        });

        res.status(201).json({
            success: true,
            data: connection
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// Update connection status
router.put('/:id', async (req, res) => {
    try {
        const connection = await Connection.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        if (!connection) {
            return res.status(404).json({
                success: false,
                message: 'Connection not found'
            });
        }

        res.json({
            success: true,
            data: connection
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// Delete connection
router.delete('/:id', async (req, res) => {
    try {
        const connection = await Connection.findByIdAndDelete(req.params.id);

        if (!connection) {
            return res.status(404).json({
                success: false,
                message: 'Connection not found'
            });
        }

        res.json({
            success: true,
            message: 'Connection deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

export default router;
