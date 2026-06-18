import mongoose from 'mongoose';
import Counter from './Counter.js';

const orderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      unique: true,
    },
    customerName: {
      type: String,
      required: [true, 'Please add customer name'],
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    apparelType: {
      type: String,
      required: [true, 'Please add apparel type'],
      enum: ['Suit', 'Shirt', 'Kurta', 'Blouse', 'Lehenga', 'Pants'],
    },
    date: {
      type: Date,
      default: Date.now,
    },
    deliveryDate: {
      type: Date,
      required: [true, 'Please add a delivery deadline date'],
    },
    fabric: {
      type: String,
      default: '',
    },
    price: {
      type: Number,
      required: [true, 'Please add price'],
      min: [0, 'Price cannot be negative'],
    },
    status: {
      type: String,
      enum: ['Incoming', 'Measuring', 'Cutting', 'Stitching', 'Checking', 'Ready', 'Delivered'],
      default: 'Incoming',
    },
    needsAster: {
      type: Boolean,
      default: false,
    },
    assignedKarigar: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Auto-increment orderId starting around 901
orderSchema.pre('save', async function () {
  if (this.isNew) {
    const counter = await Counter.findOneAndUpdate(
      { id: 'orderId' },
      { $inc: { seq: 1 } },
      { returnDocument: 'after', upsert: true }
    );
    
    let seqVal = counter.seq;
    if (seqVal <= 100) {
      const updated = await Counter.findOneAndUpdate(
        { id: 'orderId' },
        { $set: { seq: 900 + seqVal } },
        { returnDocument: 'after' }
      );
      seqVal = updated.seq;
    }
    
    this.orderId = `ORD-${seqVal}`;
  }
});

// Transform returned payload
orderSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret.orderId;
    return ret;
  },
});

export default mongoose.model('Order', orderSchema);
