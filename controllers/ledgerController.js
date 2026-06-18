import Payment from '../models/Payment.js';
import Order from '../models/Order.js';

// @desc    Get payments summary (total sales, received payments, outstanding collections)
// @route   GET /api/ledger/summary
// @access  Private
export const getLedgerSummary = async (req, res) => {
  try {
    const payments = await Payment.find({ shopId: req.user.shopId });

    const totalSales = payments.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
    const totalReceived = payments.reduce((sum, p) => sum + (p.paidAmount || 0), 0);
    const totalOutstanding = payments.reduce((sum, p) => sum + (p.balanceAmount || 0), 0);

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
