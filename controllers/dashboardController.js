import Order from '../models/Order.js';
import Customer from '../models/Customer.js';
import Delivery from '../models/Delivery.js';
import Payment from '../models/Payment.js';
import Notification from '../models/Notification.js';

// @desc    Get dashboard metrics, reminders, and recent orders
// @route   GET /api/dashboard/stats
// @access  Private
export const getDashboardStats = async (req, res) => {
  try {
    const shopId = req.user.shopId;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    // 1. Today Delivery Count (Pending deliveries due today)
    const todayDeliveryCount = await Delivery.countDocuments({
      shopId,
      status: 'Pending',
      deliveryDate: { $gte: startOfToday, $lte: endOfToday }
    });

    // 2. Late Delivery Count (Pending deliveries due before today)
    const lateDeliveryCount = await Delivery.countDocuments({
      shopId,
      status: 'Pending',
      deliveryDate: { $lt: startOfToday }
    });

    // 3. Incoming Orders Count (Orders with status 'Incoming')
    const incomingOrdersCount = await Order.countDocuments({
      shopId,
      status: 'Incoming'
    });

    // 4. Total Customers Count
    const totalCustomersCount = await Customer.countDocuments({ shopId });

    // 5. Total Revenue (Total paidAmount in Payment collection)
    const payments = await Payment.find({ shopId });
    const totalRevenue = payments.reduce((sum, p) => sum + (p.paidAmount || 0), 0);

    // 6. Recent Orders (Latest 5 orders)
    const recentOrders = await Order.find({ shopId })
      .sort({ createdAt: -1 })
      .limit(5);

    // Populate payment details for recent orders
    const recentOrdersWithPayments = [];
    for (let o of recentOrders) {
      const payment = await Payment.findOne({ orderId: o._id });
      const item = o.toJSON();
      item.payment = payment;
      recentOrdersWithPayments.push(item);
    }

    // 7. Today Reminders / Alerts (Latest 5 alerts)
    const reminders = await Notification.find({ shopId })
      .sort({ createdAt: -1 })
      .limit(5);

    // 8. Daily Stitching Distribution (sum of prices of completed orders per day this week)
    const current = new Date();
    const currentDay = current.getDay();
    const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    
    const monday = new Date(current);
    monday.setDate(current.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);

    const dailyStitching = [];
    for (let i = 0; i < 7; i++) {
      const dayStart = new Date(monday);
      dayStart.setDate(monday.getDate() + i);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      const completedOrders = await Order.find({
        shopId,
        status: { $in: ['Ready', 'Delivered'] },
        updatedAt: { $gte: dayStart, $lte: dayEnd }
      });
      const daySum = completedOrders.reduce((sum, o) => sum + (o.price || 0), 0);
      dailyStitching.push(daySum);
    }

    res.json({
      todayDelivery: todayDeliveryCount,
      lateDelivery: lateDeliveryCount,
      incomingOrders: incomingOrdersCount,
      totalCustomers: totalCustomersCount,
      totalRevenue,
      recentOrders: recentOrdersWithPayments,
      reminders,
      dailyStitching
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ message: error.message });
  }
};
