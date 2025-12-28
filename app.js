const express = require('express');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Admin = require('./model/Admin.js');
const Customer = require('./model/Customer.js');
const Medicine = require('./model/Medicine.js');
const Order = require('./model/Order.js');
const mongoose = require('mongoose');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const app = express();
const cors = require('cors');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
}

// Configure Multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname)
    }
});
const upload = multer({ storage: storage });

dotenv.config({ path: path.join(__dirname, '..', '.env') });
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        const allowedOrigins = [
            'http://localhost:5173', 
            'http://localhost:5000', 
            'https://pharmacy-store-backend.onrender.com', 
            'https://pharmacy-store-frontend-roan.vercel.app',
            'https://pharmacy-store-frontend-gfz8f8k7k-ojaswi1234s-projects.vercel.app'
        ];
        
        // Allow any Vercel preview deployment for this specific project only
        if (allowedOrigins.includes(origin) || 
            origin.includes('ojaswi1234s-projects.vercel.app') || 
            origin.includes('pharmacy-store-frontend')) {
            return callback(null, true);
        }
        
        console.log('Blocked by CORS:', origin);
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

const connectMongo = async() => {
    try{
await mongoose.connect(process.env.MONGODB_URI).then(() => {
  console.log("MongoDB connected");
})
    } catch(err){
        console.error("Error connecting to MongoDB:", err.message);
        
    }

};

const verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ message: "No token provided" });

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ message: "Unauthorized" });
        req.userId = decoded.id;
        req.userRole = decoded.role;
        next();
    });
};

const isSuperAdmin = async (req, res, next) => {
    try {
        const admin = await Admin.findById(req.userId);
        if (admin && admin.role === 'Super Admin') {
            next();
        } else {
            res.status(403).json({ message: "Require Super Admin Role" });
        }
    } catch (err) {
        res.status(500).json({ message: "Server Error" });
    }
};

app.post('/admin_register', async (req, res) => {
    const { email, password, name, phone } = req.body;
    try {
        const adminCount = await Admin.countDocuments();
        let role = 'Admin';

        // First admin is always Super Admin
        if (adminCount === 0) {
            role = 'Super Admin';
        }

        let isAdminExist = await Admin.findOne({ email });
        if (isAdminExist) {
            return res.status(400).json({ message: "Account already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newAdmin = await Admin.create({
            name: name || 'Admin',
            email,
            password: hashedPassword,
            phone: phone || '',
            role
        });

        res.status(201).json({ message: "Admin Registered Successfully", admin: newAdmin });
    } catch (err) {
        res.status(500).json({ message: "Server Error", error: err.message });
    }
});

app.post('/admin_login', async (req, res) => {
    try{
        const { email, password } = req.body;
        const admin = await Admin.findOne({ email });

        if(admin && (await bcrypt.compare(password, admin.password))){
            const token = jwt.sign(
                { id: admin._id, email: admin.email, role: admin.role },
                JWT_SECRET,
                { expiresIn: '1d' }
            );
            res.status(200).json({ 
                message: "Login Successful", 
                token,
                user: {
                    id: admin._id,
                    name: admin.name,
                    email: admin.email,
                    role: admin.role
                }
            });
        }
        else{
            res.status(401).json({ message: "Invalid Credentials" });
        }

        
    }catch(err){
        res.status(500).json({ message: "Server Error" });
    }
});

app.post('/customer_register', async (req, res) => {
    const { name, email, phone, password } = req.body;
    try{
        let isCustomerExist = await Customer.findOne({email});
        if(isCustomerExist){
            return res.status(400).json({ message: "Account already exists" });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const newCustomer = await Customer.create({
            name,
            email,
            phone,
            password: hashedPassword
        });

        res.status(201).json({ message: "Customer Registered Successfully" });
    }catch(err){
        res.status(500).json({ message: "Server Error", error: err.message });
    }
});

app.post('/customer_login', async (req, res) => {
    try{
        const { email, password } = req.body;
        const customer = await Customer.findOne({ email });

        if(customer && (await bcrypt.compare(password, customer.password))){
            const token = jwt.sign(
                { id: customer._id, email: customer.email, role: 'customer' },
                JWT_SECRET,
                { expiresIn: '1d' }
            );
            res.status(200).json({ 
                message: "Login Successful", 
                token,
                customer: { name: customer.name, email: customer.email } 
            });
        }
        else{
            res.status(401).json({ message: "Invalid Credentials" });
        }
    }catch(err){
        res.status(500).json({ message: "Server Error" });
    }
});

// MEDICINE ROUTES

// GET all medicines
app.get('/api/medicines', async (req, res) => {
    try {
        const { search, category } = req.query;
        let query = {};

        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }
        if (category && category !== 'All') {
            query.category = category;
        }

        const medicines = await Medicine.find(query).sort({ createdAt: -1 });
        res.status(200).json(medicines);
    } catch (err) {
        res.status(500).json({ message: "Error fetching medicines", error: err.message });
    }
});

// GET single medicine by ID
app.get('/api/medicines/:id', async (req, res) => {
    try {
        const medicine = await Medicine.findById(req.params.id);
        if (!medicine) {
            return res.status(404).json({ message: "Medicine not found" });
        }
        res.status(200).json(medicine);
    } catch (err) {
        res.status(500).json({ message: "Error fetching medicine", error: err.message });
    }
});

// POST - Add new medicine
app.post('/api/medicines', upload.single('image'), async (req, res) => {
    try {
        const { name, category, price, quantity, expiry, manufacturer } = req.body;
        
        if (!name || !category || !price || !quantity || !expiry || !manufacturer) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const medicineData = {
            name,
            category,
            price,
            quantity,
            expiry,
            manufacturer
        };

        if (req.file) {
            medicineData.image = req.file.path;
        }

        const newMedicine = await Medicine.create(medicineData);

        res.status(201).json({ message: "Medicine added successfully", medicine: newMedicine });
    } catch (err) {
        res.status(500).json({ message: "Error adding medicine", error: err.message });
    }
});

// PUT - Update medicine
app.put('/api/medicines/:id', upload.single('image'), async (req, res) => {
    try {
        const { name, category, price, quantity, expiry, manufacturer } = req.body;
        
        const updateData = { name, category, price, quantity, expiry, manufacturer };
        
        if (req.file) {
            updateData.image = req.file.path;
        }

        const updatedMedicine = await Medicine.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        );

        if (!updatedMedicine) {
            return res.status(404).json({ message: "Medicine not found" });
        }

        res.status(200).json({ message: "Medicine updated successfully", medicine: updatedMedicine });
    } catch (err) {
        res.status(500).json({ message: "Error updating medicine", error: err.message });
    }
});

// DELETE - Remove medicine
app.delete('/api/medicines/:id', async (req, res) => {
    try {
        const deletedMedicine = await Medicine.findByIdAndDelete(req.params.id);
        
        if (!deletedMedicine) {
            return res.status(404).json({ message: "Medicine not found" });
        }

        res.status(200).json({ message: "Medicine deleted successfully" });
    } catch (err) {
        res.status(500).json({ message: "Error deleting medicine", error: err.message });
    }
});

// GET dashboard statistics
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const totalStock = await Medicine.countDocuments();
        const medicines = await Medicine.find();
        
        // Calculate low stock items (quantity < 10)
        const lowStockCount = medicines.filter(med => med.quantity < 10).length;
        
        // Calculate expired items
        const today = new Date();
        const expiredCount = medicines.filter(med => new Date(med.expiry) < today).length;

        // Calculate total value
        const totalValue = medicines.reduce((sum, med) => sum + (med.price * med.quantity), 0);

        res.status(200).json({
            totalStock,
            lowStockCount,
            expiredCount,
            totalValue: totalValue.toFixed(2)
        });
    } catch (err) {
        res.status(500).json({ message: "Error fetching dashboard stats", error: err.message });
    }
});

// GET activity feed for dashboard
app.get('/api/dashboard/activity', async (req, res) => {
    try {
        const medicines = await Medicine.find().sort({ createdAt: -1 });
        const today = new Date();
        const activities = [];

        // Low stock alerts
        const lowStockItems = medicines.filter(med => med.quantity < 10 && med.quantity > 0);
        lowStockItems.slice(0, 3).forEach(med => {
            activities.push({
                type: 'low-stock',
                title: 'Low Stock Alert',
                message: `${med.name} is below threshold.`,
                detail: `${med.quantity} units left`,
                timestamp: med.updatedAt || med.createdAt,
                icon: 'alert'
            });
        });

        // Recently added medicines
        const recentlyAdded = medicines.slice(0, 2);
        recentlyAdded.forEach(med => {
            const timeDiff = Math.floor((today - new Date(med.createdAt)) / (1000 * 60));
            let timeStr = '';
            if (timeDiff < 60) {
                timeStr = `${timeDiff}m`;
            } else if (timeDiff < 1440) {
                timeStr = `${Math.floor(timeDiff / 60)}h`;
            } else {
                timeStr = `${Math.floor(timeDiff / 1440)}d`;
            }
            
            activities.push({
                type: 'new-item',
                title: 'New Item Added',
                message: `${med.name} added to inventory.`,
                detail: `${med.quantity} units`,
                timestamp: med.createdAt,
                timeAgo: timeStr,
                icon: 'package'
            });
        });

        // Expired items alerts
        const expiredItems = medicines.filter(med => new Date(med.expiry) < today);
        if (expiredItems.length > 0) {
            const expiredItem = expiredItems[0];
            activities.push({
                type: 'expired',
                title: 'Expiry Alert',
                message: `${expiredItem.name} has expired.`,
                detail: 'Requires attention',
                timestamp: expiredItem.expiry,
                icon: 'bell'
            });
        }

        // Sort by timestamp and limit to 5 most recent
        activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const recentActivities = activities.slice(0, 5);

        // Add time ago for all activities
        recentActivities.forEach(activity => {
            if (!activity.timeAgo) {
                const timeDiff = Math.floor((today - new Date(activity.timestamp)) / (1000 * 60));
                if (timeDiff < 60) {
                    activity.timeAgo = `${timeDiff}m`;
                } else if (timeDiff < 1440) {
                    activity.timeAgo = `${Math.floor(timeDiff / 60)}h`;
                } else {
                    activity.timeAgo = `${Math.floor(timeDiff / 1440)}d`;
                }
            }
        });

        res.status(200).json(recentActivities);
    } catch (err) {
        res.status(500).json({ message: "Error fetching activity feed", error: err.message });
    }
});

// ORDER ROUTES

// GET all orders
app.get('/api/orders', async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });
        res.status(200).json(orders);
    } catch (err) {
        res.status(500).json({ message: "Error fetching orders", error: err.message });
    }
});

// PUT - Update order status/notes
app.put('/api/orders/:id', async (req, res) => {
    try {
        const { status, notes } = req.body;
        const updatedOrder = await Order.findByIdAndUpdate(
            req.params.id,
            { status, notes },
            { new: true }
        );
        if (!updatedOrder) {
            return res.status(404).json({ message: "Order not found" });
        }
        res.status(200).json({ message: "Order updated successfully", order: updatedOrder });
    } catch (err) {
        res.status(500).json({ message: "Error updating order", error: err.message });
    }
});

// ADMIN PROFILE ROUTES

// GET all admins (Super Admin only)
app.get('/api/admins', verifyToken, isSuperAdmin, async (req, res) => {
    try {
        const admins = await Admin.find({}, '-password'); // Exclude password
        res.json(admins);
    } catch (err) {
        res.status(500).json({ message: "Error fetching admins", error: err.message });
    }
});

// DELETE admin (Super Admin only)
app.delete('/api/admins/:id', verifyToken, isSuperAdmin, async (req, res) => {
    try {
        const adminToDelete = await Admin.findById(req.params.id);
        if (!adminToDelete) {
            return res.status(404).json({ message: "Admin not found" });
        }
        
        if (adminToDelete.role === 'Super Admin') {
            return res.status(400).json({ message: "Cannot delete Super Admin" });
        }

        await Admin.findByIdAndDelete(req.params.id);
        res.json({ message: "Admin deleted successfully" });
    } catch (err) {
        res.status(500).json({ message: "Error deleting admin", error: err.message });
    }
});

// GET admin profile (assuming single admin or first found for now)
app.get('/api/admin/profile', verifyToken, async (req, res) => {
    try {
        const admin = await Admin.findById(req.userId).select('-password');
        if (!admin) {
            return res.status(404).json({ message: "Admin profile not found" });
        }
        res.status(200).json(admin);
    } catch (err) {
        res.status(500).json({ message: "Error fetching profile", error: err.message });
    }
});

// PUT - Update admin profile
app.put('/api/admin/profile', verifyToken, async (req, res) => {
    try {
        const { name, email, phone, currentPassword, newPassword } = req.body;
        
        const admin = await Admin.findById(req.userId);
        if (!admin) {
            return res.status(404).json({ message: "Admin not found" });
        }

        // Update basic info
        if (name) admin.name = name;
        if (email) admin.email = email;
        if (phone) admin.phone = phone;

        // Update password if provided
        if (newPassword) {
            if (!currentPassword) {
                return res.status(400).json({ message: "Current password is required" });
            }
            
            const isMatch = await bcrypt.compare(currentPassword, admin.password);
            if (isMatch) {
                 admin.password = await bcrypt.hash(newPassword, 10);
            } else {
                 return res.status(400).json({ message: "Incorrect current password" });
            }
        }

        await admin.save();
        res.status(200).json({ message: "Profile updated successfully", admin });
    } catch (err) {
        res.status(500).json({ message: "Error updating profile", error: err.message });
    }
});

// --- CUSTOMER ROUTES ---

// PUT - Update customer profile
app.put('/api/customer/profile', verifyToken, async (req, res) => {
    try {
        const { name, email, phone, currentPassword, newPassword } = req.body;
        
        // Note: verifyToken sets req.userId and req.userRole. 
        // Ensure customer login sets these correctly in the token.
        // Currently customer_login sets role: 'customer'.
        
        const customer = await Customer.findById(req.userId);
        if (!customer) {
            return res.status(404).json({ message: "Customer not found" });
        }

        if (name) customer.name = name;
        if (email) customer.email = email;
        if (phone) customer.phone = phone;

        if (newPassword) {
            if (!currentPassword) {
                return res.status(400).json({ message: "Current password is required" });
            }
            const isMatch = await bcrypt.compare(currentPassword, customer.password);
            if (isMatch) {
                customer.password = await bcrypt.hash(newPassword, 10);
            } else {
                return res.status(400).json({ message: "Incorrect current password" });
            }
        }

        await customer.save();
        res.status(200).json({ message: "Profile updated successfully", customer: { name: customer.name, email: customer.email, phone: customer.phone } });
    } catch (err) {
        res.status(500).json({ message: "Error updating profile", error: err.message });
    }
});

// GET single medicine details
app.get('/api/medicines/:id', async (req, res) => {
    try {
        const medicine = await Medicine.findById(req.params.id);
        if (!medicine) {
            return res.status(404).json({ message: "Medicine not found" });
        }
        res.json(medicine);
    } catch (err) {
        res.status(500).json({ message: "Error fetching medicine details", error: err.message });
    }
});

// POST create order (with optional prescription upload)
app.post('/api/orders', upload.single('prescription'), async (req, res) => {
    try {
        const { customer, items, total, address, paymentMethod } = req.body;
        let parsedItems = items;
        if (typeof items === 'string') {
            parsedItems = JSON.parse(items);
        }

        const orderData = {
            customer,
            items: parsedItems,
            total,
            address,
            paymentMethod,
            status: "Pending"
        };

        if (req.file) {
            orderData.prescriptionImage = req.file.path;
        }

        const newOrder = await Order.create(orderData);
        res.status(201).json({ message: "Order placed successfully", order: newOrder });
    } catch (err) {
        console.error("Error placing order:", err);
        res.status(500).json({ message: "Error placing order", error: err.message });
    }
});

// GET customer orders (by email)
app.get('/api/my-orders', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }
        // Case-insensitive search for the email
        const orders = await Order.find({ 
            customer: { $regex: new RegExp(`^${email.trim()}$`, 'i') } 
        }).sort({ date: -1 });
        
        res.json(orders);
    } catch (err) {
        console.error("Error in /api/my-orders:", err);
        res.status(500).json({ message: "Error fetching orders", error: err.message });
    }
});

// PUT - Cancel order (Customer)
app.put('/api/orders/:id/cancel', async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }
        
        if (order.status === 'Delivered' || order.status === 'Out for Delivery' || order.status === 'Cancelled') {
             return res.status(400).json({ message: "Cannot cancel order at this stage" });
        }

        order.status = 'Cancelled';
        await order.save();
        res.status(200).json({ message: "Order cancelled successfully", order });
    } catch (err) {
        res.status(500).json({ message: "Error cancelling order", error: err.message });
    }
});


// GET analytics data
app.get('/api/analytics', verifyToken, async (req, res) => {
    try {
        // 1. Sales Data (Last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const salesAggregation = await Order.aggregate([
            {
                $match: {
                    date: { $gte: sevenDaysAgo },
                    status: { $ne: 'Cancelled' }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
                    totalSales: { $sum: "$total" }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Format data for the chart (ensure all 7 days are present)
        const salesData = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateString = d.toISOString().split('T')[0];
            const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
            
            const found = salesAggregation.find(item => item._id === dateString);
            salesData.push({
                name: dayName,
                sales: found ? found.totalSales : 0
            });
        }

        // 2. Inventory Status
        const totalMedicines = await Medicine.countDocuments();
        const lowStock = await Medicine.countDocuments({ quantity: { $lt: 10 } });
        const outOfStock = await Medicine.countDocuments({ quantity: 0 });
        const inStock = totalMedicines - lowStock - outOfStock;

        const inventoryData = [
            { name: 'In Stock', value: inStock },
            { name: 'Low Stock', value: lowStock },
            { name: 'Out of Stock', value: outOfStock },
        ];

        // 3. Order Status Distribution
        const pendingOrders = await Order.countDocuments({ status: 'Pending' });
        const processingOrders = await Order.countDocuments({ status: 'Processing' });
        const deliveredOrders = await Order.countDocuments({ status: 'Delivered' });
        const cancelledOrders = await Order.countDocuments({ status: 'Cancelled' });

        const orderStatusData = [
            { name: 'Pending', value: pendingOrders },
            { name: 'Processing', value: processingOrders },
            { name: 'Delivered', value: deliveredOrders },
            { name: 'Cancelled', value: cancelledOrders },
        ];

        // 4. Recent Orders (Top 5)
        const recentOrders = await Order.find().sort({ date: -1 }).limit(5);

        res.json({
            salesData,
            inventoryData,
            orderStatusData,
            recentOrders
        });
    } catch (err) {
        res.status(500).json({ message: "Error fetching analytics", error: err.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    connectMongo();
    console.log(`Server is running on  http://localhost:${PORT}`);
});
