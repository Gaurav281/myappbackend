const express = require('express');
const router = express.Router();
const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');

// --- REQUEST WITHDRAWAL ---
router.post('/withdraw', async (req, res) => {
  try {
    const { userId, coins, upiId } = req.body;

    if (!userId || !coins || !upiId) {
      return res.status(400).json({ error: 'User ID, coins amount, and UPI ID are required' });
    }

    const coinVal = parseInt(coins);
    if (isNaN(coinVal) || coinVal < 1000) {
      return res.status(400).json({ error: 'Minimum withdrawal amount is 1000 coins' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.coins < coinVal) {
      return res.status(400).json({ error: `Insufficient balance. You only have ${user.coins} coins.` });
    }

    // Deduct coins immediately
    user.coins -= coinVal;
    await user.save();

    // Create withdrawal request
    const withdrawal = new Withdrawal({
      userId: user._id.toString(),
      userName: user.name,
      userPhone: user.phone,
      coins: coinVal,
      inrAmount: coinVal / 100.0,
      upiId: upiId.trim(),
      status: 'pending'
    });

    await withdrawal.save();
    res.status(201).json({ withdrawal, userCoins: user.coins });
  } catch (error) {
    res.status(500).json({ error: 'Server error requesting withdrawal' });
  }
});

// --- FETCH USER WITHDRAWALS ---
router.get('/withdrawals/:userId', async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({ userId: req.params.userId }).sort({ createdAt: -1 });
    res.json(withdrawals);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching withdrawal history' });
  }
});

module.exports = router;
