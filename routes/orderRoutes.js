import express from 'express';
const router = express.Router();
import {
  createOrder,
  getOrders,
  getOrderById,
  updateOrder,
  recordOrderPayment,
  deleteOrder,
} from '../controllers/orderController.js';
import { protect } from '../middleware/authMiddleware.js';

router.use(protect); // Secure all routes in this module

router.route('/')
  .post(createOrder)
  .get(getOrders);

router.route('/:id')
  .get(getOrderById)
  .put(updateOrder)
  .delete(deleteOrder);

router.post('/:id/payments', recordOrderPayment);

export default router;
