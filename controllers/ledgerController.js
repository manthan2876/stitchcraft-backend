import Payment from '../models/Payment.js';
import Order from '../models/Order.js';
import Transaction from '../models/Transaction.js';
import LedgerEntry from '../models/LedgerEntry.js';

// @desc    Get payments summary (total sales, received payments, outstanding collections)
// @route   GET /api/ledger/summary
// @access  Private
export const getLedgerSummary = async (req, res) => {
  try {
    const shopId = req.user.shopId;

    // Calculate totalSales from orders
    const orders = await Order.find({ shopId });
    const totalSales = orders.reduce((sum, o) => sum + (o.price || 0), 0);

    // Calculate totalReceived from Transactions
    const txs = await Transaction.find({ shopId });
    const totalReceived = txs.reduce((sum, tx) => {
      if (tx.type === 'Payment') return sum + tx.amount;
      if (tx.type === 'Refund') return sum - tx.amount;
      return sum;
    }, 0);

    // Calculate outstanding balance
    const totalOutstanding = Math.max(0, totalSales - totalReceived);

    // Calculate totalExpenses from LedgerEntry
    const expenses = await LedgerEntry.find({ shopId });
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    // Calculate total fabric profit
    const asterOrders = await Order.find({ shopId, needsAster: true }).populate('asterInventoryItem');
    const totalFabricProfit = asterOrders.reduce((sum, o) => {
      const cost = o.asterInventoryItem?.costPerUnit || 0;
      const profit = (o.asterSellingPrice - cost) * o.asterQuantity;
      return sum + (profit > 0 ? profit : 0);
    }, 0);

    res.json({
      totalSales,
      totalReceived,
      totalOutstanding,
      totalExpenses,
      totalFabricProfit,
    });
  } catch (error) {
    console.error('Get ledger summary error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all payment records (replaces transactions list)
// @route   GET /api/ledger/transactions
// @access  Private
export const getTransactions = async (req, res) => {
  try {
    const { type, search } = req.query; // 'type' holds the tab status: 'All', 'Pending', 'Paid', 'Partial'
    
    const filter = { shopId: req.user.shopId };

    if (type && type !== 'All') {
      filter.status = type;
    }

    // Retrieve payments and populate the parent order details
    const payments = await Payment.find(filter).populate({
      path: 'orderId',
      select: 'orderId customerName apparelType deliveryDate date'
    });

    // Map payments to match expected ledger columns and filter by search query
    let results = payments.map(p => {
      const order = p.orderId || {};
      return {
        _id: p._id,
        id: p._id,
        transactionId: order.orderId || 'ORD-UNKNOWN',
        orderId: order.orderId || 'ORD-UNKNOWN',
        orderObjId: order._id,
        customerName: order.customerName || 'Unknown Customer',
        description: `${order.apparelType || 'Tailoring'} Order Payment`,
        amount: p.totalAmount,
        paid: p.paidAmount,
        balance: p.balanceAmount,
        status: p.status,
        paymentType: p.paymentType,
        date: p.createdAt,
      };
    });

    if (search) {
      const q = search.toLowerCase();
      results = results.filter(r => 
        r.customerName.toLowerCase().includes(q) ||
        r.orderId.toLowerCase().includes(q) ||
        r.paymentType.toLowerCase().includes(q)
      );
    }

    // Sort by newest payment record first
    results.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json(results);
  } catch (error) {
    console.error('Get payments list error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all business expenses
// @route   GET /api/ledger/expenses
// @access  Private
export const getExpenses = async (req, res) => {
  try {
    const { category, search } = req.query;
    const filter = { shopId: req.user.shopId };

    if (category && category !== 'All') {
      filter.category = category;
    }

    let query = LedgerEntry.find(filter).sort({ date: -1 });
    const expenses = await query;

    let results = expenses;
    if (search) {
      const q = search.toLowerCase();
      results = expenses.filter(e => 
        (e.description || '').toLowerCase().includes(q) ||
        (e.category || '').toLowerCase().includes(q)
      );
    }

    res.json(results);
  } catch (error) {
    console.error('Get expenses error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a new expense entry
// @route   POST /api/ledger/expenses
// @access  Private
export const createExpense = async (req, res) => {
  try {
    const { amount, category, description, date } = req.body;

    if (!amount || !category) {
      return res.status(400).json({ message: 'Amount and category are required' });
    }

    const expense = await LedgerEntry.create({
      shopId: req.user.shopId,
      amount: Number(amount),
      category,
      description: description || '',
      date: date || new Date(),
    });

    res.status(201).json(expense);
  } catch (error) {
    console.error('Create expense error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete an expense entry
// @route   DELETE /api/ledger/expenses/:id
// @access  Private
export const deleteExpense = async (req, res) => {
  try {
    const expense = await LedgerEntry.findOne({ _id: req.params.id, shopId: req.user.shopId });

    if (!expense) {
      return res.status(404).json({ message: 'Expense entry not found' });
    }

    await LedgerEntry.deleteOne({ _id: expense._id });
    res.json({ message: 'Expense entry deleted successfully' });
  } catch (error) {
    console.error('Delete expense error:', error);
    res.status(500).json({ message: error.message });
  }
};
