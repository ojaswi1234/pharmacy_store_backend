const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    customer: {
        type: String,
        required: true
    },
    items: [{
        name: String,
        price: Number,
        quantity: Number,
        medicineId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Medicine'
        }
    }],
    total: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ["Pending", "Processing", "Out for Delivery", "Delivered", "Cancelled"],
        default: "Pending"
    },
    notes: {
        type: String,
        default: ""
    },
    date: {
        type: Date,
        default: Date.now
    },
    address: {
        type: String,
        required: true
    },
    paymentMethod: {
        type: String,
        enum: ["Credit Card", "Cash on Delivery"],
        required: true
    },
    prescriptionImage: {
        type: String, // Path to the uploaded image
        default: null
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Order', orderSchema);
