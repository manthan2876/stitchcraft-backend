import express from 'express';
const router = express.Router();
import {
  getLedgerSummary,
  getTransactions,
  getExpenses,
  createExpense,
  deleteExpense,
} from '../controllers/ledgerController.js';
import { protect } from '../middleware/authMiddleware.js';

router.use(protect); // Secure all routes in this module

router.get('/summary', getLedgerSummary);
router.get('/transactions', getTransactions);
router.get('/expenses', getExpenses);
router.post('/expenses', createExpense);
router.delete('/expenses/:id', deleteExpense);

export default router;
