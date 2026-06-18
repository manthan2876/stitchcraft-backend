import Inventory from '../models/Inventory.js';
import mongoose from 'mongoose';

// @desc    Create a new inventory item
// @route   POST /api/inventory
// @access  Private
export const createInventoryItem = async (req, res) => {
  try {
    const { itemName, quantity, unit, minQuantity } = req.body;

    if (!itemName) {
      return res.status(400).json({ message: 'Item name is required' });
    }

    const item = await Inventory.create({
      shopId: req.user.shopId,
      itemName,
      quantity: quantity !== undefined ? Number(quantity) : 0,
      unit: unit || 'meters',
      minQuantity: minQuantity !== undefined ? Number(minQuantity) : 10,
    });

    res.status(201).json(item);
  } catch (error) {
    console.error('Create inventory item error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all inventory items for a shop
// @route   GET /api/inventory
// @access  Private
export const getInventory = async (req, res) => {
  try {
    const search = req.query.search || '';
    const filter = { shopId: req.user.shopId };

    if (search) {
      filter.itemName = { $regex: search, $options: 'i' };
    }

    const inventory = await Inventory.find(filter).sort({ itemName: 1 });
    res.json(inventory);
  } catch (error) {
    console.error('Get inventory error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get details of a single inventory item
// @route   GET /api/inventory/:id
// @access  Private
export const getInventoryItemById = async (req, res) => {
  try {
    const item = await Inventory.findOne({ _id: req.params.id, shopId: req.user.shopId });

    if (!item) {
      return res.status(404).json({ message: 'Inventory item not found' });
    }

    res.json(item);
  } catch (error) {
    console.error('Get inventory item by ID error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update an inventory item
// @route   PUT /api/inventory/:id
// @access  Private
export const updateInventoryItem = async (req, res) => {
  try {
    const item = await Inventory.findOne({ _id: req.params.id, shopId: req.user.shopId });

    if (!item) {
      return res.status(404).json({ message: 'Inventory item not found' });
    }

    const { itemName, quantity, unit, minQuantity } = req.body;

    if (itemName) item.itemName = itemName;
    if (quantity !== undefined) item.quantity = Number(quantity);
    if (unit) item.unit = unit;
    if (minQuantity !== undefined) item.minQuantity = Number(minQuantity);

    const updatedItem = await item.save();
    res.json(updatedItem);
  } catch (error) {
    console.error('Update inventory item error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete an inventory item
// @route   DELETE /api/inventory/:id
// @access  Private
export const deleteInventoryItem = async (req, res) => {
  try {
    const item = await Inventory.findOne({ _id: req.params.id, shopId: req.user.shopId });

    if (!item) {
      return res.status(404).json({ message: 'Inventory item not found' });
    }

    await Inventory.deleteOne({ _id: item._id });
    res.json({ message: 'Inventory item deleted successfully' });
  } catch (error) {
    console.error('Delete inventory item error:', error);
    res.status(500).json({ message: error.message });
  }
};
