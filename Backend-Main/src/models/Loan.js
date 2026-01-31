import mongoose from 'mongoose';

const loanSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    portfolioId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Portfolio',
        required: true
    },
    loanAmount: {
        type: Number,
        required: true,
        min: 0
    },
    collateralValue: {
        type: Number,
        required: true,
        min: 0
    },
    loanToValue: {
        type: Number,
        required: true,
        min: 0,
        max: 100
    },
    interestRate: {
        type: Number,
        required: true,
        min: 0
    },
    duration: {
        type: Number, // in months
        required: true,
        min: 1
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'active', 'rejected', 'paid', 'defaulted'],
        default: 'pending'
    },
    collateralAssets: [{
        assetId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Asset'
        },
        symbol: String,
        amount: Number,
        value: Number
    }],
    riskScore: {
        type: Number,
        min: 0,
        max: 100
    },
    riskLevel: {
        type: String,
        enum: ['Low', 'Medium', 'High'],
        default: 'Medium'
    },
    monthlyPayment: {
        type: Number,
        min: 0
    },
    totalRepayment: {
        type: Number,
        min: 0
    },
    startDate: {
        type: Date,
        default: null
    },
    endDate: {
        type: Date,
        default: null
    },
    approvedBy: {
        type: String,
        default: null
    },
    approvedAt: {
        type: Date,
        default: null
    },
    rejectionReason: {
        type: String,
        default: null
    }
}, {
    timestamps: true
});

// Index for faster queries
loanSchema.index({ userId: 1, status: 1 });

// Calculate monthly payment and total repayment
loanSchema.methods.calculatePayments = function () {
    const monthlyRate = this.interestRate / 100 / 12;
    const numPayments = this.duration;

    // Monthly payment formula: P * [r(1+r)^n] / [(1+r)^n - 1]
    this.monthlyPayment = this.loanAmount *
        (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
        (Math.pow(1 + monthlyRate, numPayments) - 1);

    this.totalRepayment = this.monthlyPayment * numPayments;

    return {
        monthlyPayment: this.monthlyPayment,
        totalRepayment: this.totalRepayment
    };
};

const Loan = mongoose.model('Loan', loanSchema);

export default Loan;
