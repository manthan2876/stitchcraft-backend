import Payment from '../models/Payment.js';
import Order from '../models/Order.js';
import Transaction from '../models/Transaction.js';

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

    res.json({
      totalSales,
      totalReceived,
      totalOutstanding,
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
