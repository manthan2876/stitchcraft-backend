import Order from '../models/Order.js';
import Customer from '../models/Customer.js';
import Payment from '../models/Payment.js';
import Delivery from '../models/Delivery.js';
import Notification from '../models/Notification.js';
import Measurement from '../models/Measurement.js';
import Inventory from '../models/Inventory.js';
import mongoose from 'mongoose';

// Statuses at which astar/lining is considered consumed (Stitching onwards)
const ASTAR_DEDUCT_STATUSES = ['Stitching', 'Checking', 'Ready', 'Delivered'];

// Helper to find order by ID or custom orderId, scoped to shopId
const findOrderScoped = async (id, shopId) => {
  const query = mongoose.Types.ObjectId.isValid(id)
    ? { _id: id, shopId }
    : { orderId: id, shopId };
  return await Order.findOne(query).populate('assignedKarigar');
};

// @desc    Create a new order
// @route   POST /api/orders
// @access  Private
export const createOrder = async (req, res) => {
  try {
    const {
      customerName,
      customerId,
      customerPhone,
      customerAddress,
      apparelType,
      deliveryDate,
      price,
      advancePaid,
      fabric,
      paymentType,
      measurements,
      needsAster,
      asterQuantity,
      asterInventoryItem,
      assignedKarigar,
      measurementType,
      maapImageUrl,
    } = req.body;

    if (!customerName || !apparelType || !deliveryDate || price === undefined) {
      return res.status(400).json({ message: 'Please provide customerName, apparelType, deliveryDate, and price' });
    }

    // Resolve Customer
    let customerObj = null;
    if (customerId) {
      const custQuery = mongoose.Types.ObjectId.isValid(customerId)
        ? { _id: customerId, shopId: req.user.shopId }
        : { customerId, shopId: req.user.shopId };
      customerObj = await Customer.findOne(custQuery);
    }

    if (!customerObj) {
      // Look up by name + phone or just name scoped to shopId
      const nameQuery = customerPhone
        ? { name: customerName, phone: customerPhone, shopId: req.user.shopId }
        : { name: customerName, shopId: req.user.shopId };
      customerObj = await Customer.findOne(nameQuery);
    }

    // If still no customer found, create a new customer profile automatically to keep CRM healthy
    if (!customerObj) {
      customerObj = await Customer.create({
        name: customerName,
        phone: customerPhone || '0000000000',
        email: '',
        address: customerAddress || '',
        shopId: req.user.shopId,
        ordersCount: 1,
      });
    } else {
      customerObj.ordersCount = (customerObj.ordersCount || 0) + 1;
      await customerObj.save();
    }

    // Save/update customer measurements only if measurementType is 'Measurements'
    if (measurementType !== 'Maap' && measurements) {
      let measurementRecord = await Measurement.findOne({ customerId: customerObj._id });
      if (!measurementRecord) {
        measurementRecord = new Measurement({
          shopId: req.user.shopId,
          customerId: customerObj._id,
        });
      }

      if (measurements.shirt) {
        measurementRecord.shirt = {
          ...measurementRecord.shirt.toObject(),
          ...measurements.shirt,
        };
      }
      if (measurements.pant) {
        measurementRecord.pant = {
          ...measurementRecord.pant.toObject(),
          ...measurements.pant,
        };
      }
      if (measurements.others !== undefined) {
        measurementRecord.others = measurements.others;
      }
      await measurementRecord.save();
    }

    // Create Order
    const order = await Order.create({
      customerName: customerObj.name,
      customer: customerObj._id,
      apparelType,
      deliveryDate,
      price,
      fabric: fabric || '',
      shopId: req.user.shopId,
      status: 'Incoming',
      needsAster: needsAster || false,
      asterQuantity: needsAster ? (Number(asterQuantity) || 0) : 0,
      asterInventoryItem: (needsAster && asterInventoryItem) ? asterInventoryItem : null,
      measurementType: measurementType || 'Maap',
      maapImageUrl: maapImageUrl || '',
      assignedKarigar: assignedKarigar || null,
    });

    // Create associated Payment record
    const payment = await Payment.create({
      shopId: req.user.shopId,
      orderId: order._id,
      totalAmount: price,
      paidAmount: advancePaid || 0,
      paymentType: paymentType || 'Cash',
    });

    // Create associated Delivery record
    const delivery = await Delivery.create({
      shopId: req.user.shopId,
      orderId: order._id,
      deliveryDate,
      status: 'Pending',
    });

    // Create Notification alert
    await Notification.create({
      shopId: req.user.shopId,
      customerId: customerObj._id,
      orderId: order._id,
      message: `New order ${order.orderId} created for ${customerObj.name}. Delivery due on ${new Date(deliveryDate).toLocaleDateString()}.`,
    });

    // Return order with payment/delivery attached
    const result = order.toJSON();
    result.payment = payment;
    result.delivery = delivery;

    res.status(201).json(result);
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all orders scoped to logged-in Shop (with filters)
// @route   GET /api/orders
// @access  Private
export const getOrders = async (req, res) => {
  try {
    const { status, urgency } = req.query;

    const filter = { shopId: req.user.shopId };

    if (status) {
      filter.status = status;
    }

    if (urgency === 'high') {
      const threeDaysLater = new Date();
      threeDaysLater.setDate(threeDaysLater.getDate() + 3);
      filter.deliveryDate = { $lte: threeDaysLater };
      filter.status = { $ne: 'Delivered' };
    }

    const orders = await Order.find(filter).populate('assignedKarigar').sort({ deliveryDate: 1 });

    // Populate payment details
    const populatedOrders = [];
    for (let o of orders) {
      const payment = await Payment.findOne({ orderId: o._id });
      const delivery = await Delivery.findOne({ orderId: o._id });
      const item = o.toJSON();
      item.payment = payment;
      item.delivery = delivery;
      populatedOrders.push(item);
    }

    res.json(populatedOrders);
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get specific order details
// @route   GET /api/orders/:id
// @access  Private
export const getOrderById = async (req, res) => {
  try {
    const order = await findOrderScoped(req.params.id, req.user.shopId);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Populate customer details on the retrieved order
    await order.populate('customer');

    const payment = await Payment.findOne({ orderId: order._id });
    const delivery = await Delivery.findOne({ orderId: order._id });
    const measurements = order.customer
      ? await Measurement.findOne({ customerId: order.customer._id })
      : null;

    const result = order.toJSON();
    result.payment = payment;
    result.delivery = delivery;
    result.measurements = measurements;

    res.json(result);
  } catch (error) {
    console.error('Get order by ID error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update order active stage or details
// @route   PUT /api/orders/:id
// @access  Private
export const updateOrder = async (req, res) => {
  try {
    const order = await findOrderScoped(req.params.id, req.user.shopId);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const { status, deliveryDate, price, fabric, needsAster, asterQuantity, asterInventoryItem, assignedKarigar, measurementType, maapImageUrl } = req.body;

    if (deliveryDate) {
      order.deliveryDate = deliveryDate;
      await Delivery.updateOne({ orderId: order._id }, { deliveryDate });
    }
    if (price !== undefined) {
      order.price = price;
      const payment = await Payment.findOne({ orderId: order._id });
      if (payment) {
        payment.totalAmount = price;
        await payment.save();
      }
    }
    if (fabric !== undefined) order.fabric = fabric;
    if (needsAster !== undefined) order.needsAster = needsAster;
    if (asterQuantity !== undefined) order.asterQuantity = Number(asterQuantity) || 0;
    if (asterInventoryItem !== undefined) order.asterInventoryItem = asterInventoryItem || null;
    if (measurementType !== undefined) order.measurementType = measurementType;
    if (maapImageUrl !== undefined) order.maapImageUrl = maapImageUrl;
    if (assignedKarigar !== undefined) order.assignedKarigar = assignedKarigar || null;

    let statusChanged = false;
    let oldStatus = order.status;
    const newStatus = status;

    if (newStatus && newStatus !== order.status) {
      // --- Astar inventory auto-deduction logic ---
      const willDeduct = ASTAR_DEDUCT_STATUSES.includes(newStatus);
      const wasDeducted = order.asterDeducted;

      if (order.needsAster && order.asterQuantity > 0 && order.asterInventoryItem) {
        if (willDeduct && !wasDeducted) {
          // Deduct from inventory
          const invItem = await Inventory.findOne({ _id: order.asterInventoryItem, shopId: req.user.shopId });
          if (invItem) {
            invItem.quantity = Math.max(0, invItem.quantity - order.asterQuantity);
            await invItem.save();
            order.asterDeducted = true;
            await Notification.create({
              shopId: req.user.shopId,
              orderId: order._id,
              message: `Astar stock reduced by ${order.asterQuantity} ${invItem.unit} for order ${order.orderId} (${invItem.itemName}).`,
            });
          }
        } else if (!willDeduct && wasDeducted) {
          // Re-add to inventory (status moved back)
          const invItem = await Inventory.findOne({ _id: order.asterInventoryItem, shopId: req.user.shopId });
          if (invItem) {
            invItem.quantity = invItem.quantity + order.asterQuantity;
            await invItem.save();
            order.asterDeducted = false;
          }
        }
      }

      order.status = newStatus;
      statusChanged = true;
    }

    const updatedOrder = await order.save();

    // If status changed to Delivered, sync delivery collection and send alert
    if (statusChanged) {
      if (status === 'Delivered') {
        await Delivery.updateOne(
          { orderId: order._id },
          { status: 'Delivered', deliveredBy: req.user.name || 'Owner' }
        );
        await Notification.create({
          shopId: req.user.shopId,
          customerId: order.customer,
          orderId: order._id,
          message: `Order ${order.orderId} has been successfully delivered.`,
        });
      } else {
        await Notification.create({
          shopId: req.user.shopId,
          customerId: order.customer,
          orderId: order._id,
          message: `Order ${order.orderId} status changed from ${oldStatus} to ${status}.`,
        });
      }
    }

    const payment = await Payment.findOne({ orderId: order._id });
    const delivery = await Delivery.findOne({ orderId: order._id });

    const result = updatedOrder.toJSON();
    result.payment = payment;
    result.delivery = delivery;

    res.json(result);
  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Receive payment against an order
// @route   POST /api/orders/:id/payments
// @access  Private
export const recordOrderPayment = async (req, res) => {
  try {
    const order = await findOrderScoped(req.params.id, req.user.shopId);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const { amount, paymentType } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ message: 'Please provide a positive payment amount' });
    }

    const payment = await Payment.findOne({ orderId: order._id });
    if (!payment) {
      return res.status(404).json({ message: 'Associated payment record not found' });
    }

    // Add paidAmount
    payment.paidAmount += Number(amount);
    if (paymentType) payment.paymentType = paymentType;
    await payment.save();

    // Create Notification
    await Notification.create({
      shopId: req.user.shopId,
      customerId: order.customer,
      orderId: order._id,
      message: `Payment of ₹${amount} received for order ${order.orderId}. New balance: ₹${payment.balanceAmount}.`,
    });

    const result = order.toJSON();
    result.payment = payment;
    result.delivery = await Delivery.findOne({ orderId: order._id });

    res.json(result);
  } catch (error) {
    console.error('Record payment error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete a specific order and clean up associated records
// @route   DELETE /api/orders/:id
// @access  Private
export const deleteOrder = async (req, res) => {
  try {
    const order = await findOrderScoped(req.params.id, req.user.shopId);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Decrement customer's ordersCount if linked
    if (order.customer) {
      await Customer.updateOne(
        { _id: order.customer, shopId: req.user.shopId },
        { $inc: { ordersCount: -1 } }
      );
    }

    // Delete associated Payment record
    await Payment.deleteOne({ orderId: order._id, shopId: req.user.shopId });

    // Delete associated Delivery record
    await Delivery.deleteOne({ orderId: order._id, shopId: req.user.shopId });

    // Delete associated Notification records
    await Notification.deleteMany({ orderId: order._id, shopId: req.user.shopId });

    // Delete the Order itself
    await Order.deleteOne({ _id: order._id, shopId: req.user.shopId });

    res.json({ message: 'Order and associated records deleted successfully' });
  } catch (error) {
    console.error('Delete order error:', error);
    res.status(500).json({ message: error.message });
  }
};
