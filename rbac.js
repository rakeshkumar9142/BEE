const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());

// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/rbacdb', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// User Schema with Role
const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        match: /.+\@.+\..+/
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    role: {
        type: String,
        enum: ['user', 'admin', 'moderator'],
        default: 'user'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// User Model
const User = mongoose.model('User', userSchema);

// JWT Secret
const JWT_SECRET = 'your-secret-key-change-this-in-production';

// ========================
// MIDDLEWARE FUNCTIONS
// ========================

// 1. Authentication Middleware
const authenticate = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ 
            success: false, 
            message: 'Access denied. No token provided.' 
        });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ 
            success: false, 
            message: 'Invalid or expired token.' 
        });
    }
};

// 2. Role-Based Authorization Middleware
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                success: false, 
                message: 'User not authenticated.' 
            });
        }
        
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ 
                success: false, 
                message: `Access denied. Required role: ${roles.join(' or ')}` 
            });
        }
        
        next();
    };
};

// 3. Admin-Only Middleware (Specific)
const adminOnly = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ 
            success: false, 
            message: 'User not authenticated.' 
        });
    }
    
    if (req.user.role !== 'admin') {
        return res.status(403).json({ 
            success: false, 
            message: 'Access denied. Admin role required.' 
        });
    }
    
    next();
};

// ========================
// ROUTES
// ========================

// PUBLIC ROUTES

// Home
app.get('/', (req, res) => {
    res.json({ 
        message: 'RBAC API System', 
        endpoints: {
            public: ['POST /signup', 'POST /login'],
            user: ['GET /profile', 'PUT /profile'],
            admin: ['GET /admin', 'GET /admin/users', 'PUT /admin/users/:id/role']
        }
    });
});

// Signup (Public)
app.post('/signup', async (req, res) => {
    try {
        const { username, email, password, role = 'user' } = req.body;
        
        // Prevent self-assigning admin role
        const userRole = role === 'admin' ? 'user' : role;
        
        // Create user
        const user = new User({ 
            username, 
            email, 
            password, 
            role: userRole 
        });
        
        await user.save();
        
        // Generate token
        const token = jwt.sign(
            { 
                userId: user._id, 
                username: user.username, 
                email: user.email,
                role: user.role 
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role
            },
            token
        });
    } catch (error) {
        res.status(400).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// Login (Public)
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid credentials' 
            });
        }
        
        // Check if user is active
        if (!user.isActive) {
            return res.status(403).json({ 
                success: false, 
                message: 'Account is deactivated' 
            });
        }
        
        // Verify password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid credentials' 
            });
        }
        
        // Generate token
        const token = jwt.sign(
            { 
                userId: user._id, 
                username: user.username, 
                email: user.email,
                role: user.role 
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.json({
            success: true,
            message: 'Login successful',
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role
            },
            token
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// PROTECTED ROUTES

// 1. User Profile (Authenticated users only)
app.get('/profile', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('-password');
        res.json({
            success: true,
            user
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// 2. Update Profile (Own profile only)
app.put('/profile', authenticate, async (req, res) => {
    try {
        const { username, email } = req.body;
        
        const updatedUser = await User.findByIdAndUpdate(
            req.user.userId,
            { username, email },
            { new: true, runValidators: true }
        ).select('-password');
        
        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: updatedUser
        });
    } catch (error) {
        res.status(400).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// 3. Change Password (Own profile only)
app.put('/profile/change-password', authenticate, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        const user = await User.findById(req.user.userId);
        
        // Verify current password
        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(401).json({ 
                success: false, 
                message: 'Current password is incorrect' 
            });
        }
        
        // Update password
        user.password = newPassword;
        await user.save();
        
        res.json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        res.status(400).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// ADMIN-ONLY ROUTES

// 4. Admin Dashboard (Admin only - using specific middleware)
app.get('/admin', authenticate, adminOnly, (req, res) => {
    res.json({
        success: true,
        message: 'Welcome to Admin Dashboard',
        admin: req.user,
        features: [
            'View all users',
            'Manage user roles',
            'Activate/deactivate users',
            'View system statistics'
        ]
    });
});

// 5. Get all users (Admin only - using authorize middleware)
app.get('/admin/users', authenticate, authorize('admin'), async (req, res) => {
    try {
        const users = await User.find().select('-password');
        
        // Calculate statistics
        const stats = {
            total: users.length,
            active: users.filter(u => u.isActive).length,
            admins: users.filter(u => u.role === 'admin').length,
            users: users.filter(u => u.role === 'user').length,
            moderators: users.filter(u => u.role === 'moderator').length
        };
        
        res.json({
            success: true,
            stats,
            users
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// 6. Update user role (Admin only)
app.put('/admin/users/:id/role', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { role } = req.body;
        const { id } = req.params;
        
        // Prevent modifying own role (optional)
        if (id === req.user.userId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Cannot modify your own role' 
            });
        }
        
        // Validate role
        if (!['user', 'admin', 'moderator'].includes(role)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid role' 
            });
        }
        
        const user = await User.findByIdAndUpdate(
            id,
            { role },
            { new: true, runValidators: true }
        ).select('-password');
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        res.json({
            success: true,
            message: `User role updated to ${role}`,
            user
        });
    } catch (error) {
        res.status(400).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// 7. Toggle user active status (Admin only)
app.put('/admin/users/:id/status', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { isActive } = req.body;
        const { id } = req.params;
        
        // Prevent deactivating self
        if (id === req.user.userId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Cannot deactivate yourself' 
            });
        }
        
        const user = await User.findByIdAndUpdate(
            id,
            { isActive },
            { new: true }
        ).select('-password');
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        res.json({
            success: true,
            message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
            user
        });
    } catch (error) {
        res.status(400).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// 8. Delete user (Admin only)
app.delete('/admin/users/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        
        // Prevent deleting self
        if (id === req.user.userId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Cannot delete yourself' 
            });
        }
        
        const user = await User.findByIdAndDelete(id);
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        res.json({
            success: true,
            message: 'User deleted successfully'
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// MODERATOR ROUTES (Example)

// 9. Moderator dashboard (Moderator and Admin)
app.get('/moderator', authenticate, authorize('moderator', 'admin'), (req, res) => {
    res.json({
        success: true,
        message: 'Welcome to Moderator Dashboard',
        user: req.user,
        permissions: [
            'View flagged content',
            'Manage user comments',
            'View user reports'
        ]
    });
});

// 10. Get active users (Moderator and Admin)
app.get('/moderator/users/active', authenticate, authorize('moderator', 'admin'), async (req, res) => {
    try {
        const users = await User.find({ isActive: true }).select('-password');
        res.json({
            success: true,
            count: users.length,
            users
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        success: false, 
        message: 'Internal server error' 
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ 
        success: false, 
        message: 'Route not found' 
    });
});

// Start Server
app.listen(PORT, () => {
    console.log(`RBAC Server running on http://localhost:${PORT}`);
    console.log(`Try these endpoints:`);
    console.log(`1. POST http://localhost:${PORT}/signup`);
    console.log(`2. POST http://localhost:${PORT}/login`);
    console.log(`3. GET http://localhost:${PORT}/admin (Admin only)`);
});