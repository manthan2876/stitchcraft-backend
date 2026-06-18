import User from '../models/User.js';
import Shop from '../models/Shop.js';
import jwt from 'jsonwebtoken';

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

    // Validate password
    if (user && (await user.matchPassword(password))) {
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
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
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

