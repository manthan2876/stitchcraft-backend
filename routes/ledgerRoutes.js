import express from 'express';
const router = express.Router();
import {
  getLedgerSummary,
  getTransactions,
} from '../controllers/ledgerController.js';
import { protect } from '../middleware/authMiddleware.js';

router.use(protect); // Secure all routes in this module

router.get('/summary', getLedgerSummary);
router.get('/transactions', getTransactions);

export default router;
