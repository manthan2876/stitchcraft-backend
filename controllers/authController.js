import User from '../models/User.js';
import Shop from '../models/Shop.js';
import jwt from 'jsonwebtoken';
import Customer from '../models/Customer.js';
import Order from '../models/Order.js';
import Delivery from '../models/Delivery.js';
import Inventory from '../models/Inventory.js';
import Karigar from '../models/Karigar.js';
import LedgerEntry from '../models/LedgerEntry.js';
import Machine from '../models/Machine.js';
import Payment from '../models/Payment.js';
import Measurement from '../models/Measurement.js';
import Transaction from '../models/Transaction.js';
import Notification from '../models/Notification.js';
import ActionLog from '../models/ActionLog.js';

// Generate JWT token including shopId in payload
const generateToken = (id, shopId) => {
  return jwt.sign(
    { id, shopId },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
};

// @desc    Register a new shop owner and create a shop
// @route   POST /api/auth/register
// @access  Public
export const registerUser = async (req, res) => {
  try {
    const { name, email, password, shopName, phone, address } = req.body;

    if (!name || !email || !password || !shopName) {
      return res.status(400).json({ message: 'Please provide name, email, password, and shopName' });
    }

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    // 1. Create User with role 'owner'
    const user = new User({
      name,
      email,
      password,
      role: 'owner',
    });
    await user.save();

    // 2. Create Shop
    const shop = new Shop({
      shopName,
      ownerId: user._id,
      phone: phone || '',
      address: address || '',
    });
    await shop.save();

    // 3. Link Shop to User
    user.shopId = shop._id;
    await user.save();

    // Respond with user data and token
    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      shopId: shop._id,
      shopName: shop.shopName,
      token: generateToken(user._id, shop._id),
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    // Find user by email and populate shop details
    const user = await User.findOne({ email }).populate('shopId');

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Validate password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check account status and deletion requested date
    if (user.status === 'deleting') {
      const gracePeriodMs = 15 * 24 * 60 * 60 * 1000;
      const timeSinceRequest = Date.now() - new Date(user.deletionRequestedAt).getTime();
      
      if (timeSinceRequest > gracePeriodMs) {
        return res.status(401).json({ message: 'This account has been permanently deleted.' });
      } else {
        // Reactivate user since they logged in within the 15 days window with correct password!
        user.status = 'active';
        user.deletionRequestedAt = undefined;
        user.deletionReason = undefined;
        user.reactivated = true;
        await user.save();

        // Log the reactivation action
        await ActionLog.create({
          userId: user._id,
          action: 'REACTIVATE_ACCOUNT',
          details: 'Account successfully reactivated via login within 15-day grace period.',
        });
      }
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      shopId: user.shopId ? user.shopId._id : null,
      shopName: user.shopId ? user.shopId.shopName : '',
      token: generateToken(user._id, user.shopId ? user.shopId._id : null),
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get user profile
// @route   GET /api/auth/profile
// @access  Private
export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('shopId');

    if (user) {
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        shopId: user.shopId ? user.shopId._id : null,
        shopName: user.shopId ? user.shopId.shopName : '',
      });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update user profile details & avatar (profile photo)
// @route   PUT /api/auth/profile
// @access  Private
export const updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { name, avatar } = req.body;

    if (name) user.name = name;
    if (avatar !== undefined) user.avatar = avatar; // can accept base64 string

    const updatedUser = await user.save();
    
    // Populate shop details if linked
    const populated = await User.findById(updatedUser._id).populate('shopId');

    res.json({
      _id: populated._id,
      name: populated.name,
      email: populated.email,
      role: populated.role,
      avatar: populated.avatar,
      shopId: populated.shopId ? populated.shopId._id : null,
      shopName: populated.shopId ? populated.shopId.shopName : '',
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Switch active shop and return new token
// @route   PUT /api/auth/switch-shop/:id
// @access  Private
export const switchActiveShop = async (req, res) => {
  try {
    const shop = await Shop.findOne({ _id: req.params.id, ownerId: req.user._id });
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found or access denied' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.shopId = shop._id;
    await user.save();

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      shopId: shop._id,
      shopName: shop.shopName,
      token: generateToken(user._id, shop._id), // return new token
    });
  } catch (error) {
    console.error('Switch shop error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update user password
// @route   PUT /api/auth/update-password
// @access  Private
export const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Please provide current and new passwords' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check current password
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: 'Incorrect current password' });
    }

    // Update password (pre-save hook will hash it)
    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Download all data as JSON
// @route   POST /api/auth/account/download-data
// @access  Private
export const downloadAllData = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ message: 'Password is required' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Incorrect password' });
    }

    const shopId = user.shopId;
    if (!shopId) {
      return res.status(400).json({ message: 'No active shop selected' });
    }

    // Gather all data
    const customers = await Customer.find({ shopId });
    const orders = await Order.find({ shopId });
    const deliveries = await Delivery.find({ shopId });
    const inventory = await Inventory.find({ shopId });
    const karigars = await Karigar.find({ shopId });
    const ledgerEntries = await LedgerEntry.find({ shopId });
    const machines = await Machine.find({ shopId });
    const payments = await Payment.find({ shopId });
    const measurements = await Measurement.find({ shopId });
    const transactions = await Transaction.find({ shopId });
    const notifications = await Notification.find({ shopId });

    // Log action
    await ActionLog.create({
      userId: user._id,
      action: 'DOWNLOAD_DATA',
      details: `Data exported for active shop ${shopId}`,
    });

    res.json({
      exportedAt: new Date(),
      user: {
        name: user.name,
        email: user.email,
        role: user.role,
      },
      shopId,
      customers,
      orders,
      deliveries,
      inventory,
      karigars,
      ledgerEntries,
      machines,
      payments,
      measurements,
      transactions,
      notifications,
    });
  } catch (error) {
    console.error('Download data error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete all active shop data
// @route   POST /api/auth/account/delete-all-data
// @access  Private
export const deleteAllData = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ message: 'Password is required' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Incorrect password' });
    }

    const shopId = user.shopId;
    if (!shopId) {
      return res.status(400).json({ message: 'No active shop selected' });
    }

    // Delete all records of the active shop
    await Customer.deleteMany({ shopId });
    await Order.deleteMany({ shopId });
    await Delivery.deleteMany({ shopId });
    await Inventory.deleteMany({ shopId });
    await Karigar.deleteMany({ shopId });
    await LedgerEntry.deleteMany({ shopId });
    await Machine.deleteMany({ shopId });
    await Payment.deleteMany({ shopId });
    await Measurement.deleteMany({ shopId });
    await Transaction.deleteMany({ shopId });
    await Notification.deleteMany({ shopId });

    // Log action
    await ActionLog.create({
      userId: user._id,
      action: 'DELETE_ALL_DATA',
      details: `All data cleared for active shop ${shopId}`,
    });

    res.json({ message: 'All shop data deleted successfully' });
  } catch (error) {
    console.error('Delete all data error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Request account deletion
// @route   POST /api/auth/account/delete-account
// @access  Private
export const deleteAccountRequest = async (req, res) => {
  try {
    const { password, reason } = req.body;
    if (!password) {
      return res.status(400).json({ message: 'Password is required' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Incorrect password' });
    }

    // Mark account for deletion (will last for 15 days)
    user.status = 'deleting';
    user.deletionRequestedAt = new Date();
    user.deletionReason = reason || '';
    user.reactivated = false;
    await user.save();

    // Log action
    await ActionLog.create({
      userId: user._id,
      action: 'DELETE_ACCOUNT_REQUEST',
      details: reason ? `Reason: ${reason}` : 'No reason provided',
    });

    res.json({ message: 'Account scheduled for deletion. Logging out...' });
  } catch (error) {
    console.error('Delete account request error:', error);
    res.status(500).json({ message: error.message });
  }
};



