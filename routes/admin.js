const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');

// --- MIDDLEWARE: VERIFY ADMIN STATUS ---
async function verifyAdmin(req, res, next) {
  const adminId = req.headers['admin-id'];
  if (!adminId) {
    return res.status(401).json({ error: 'Unauthorized. Admin ID header required.' });
  }
  try {
    const user = await User.findById(adminId);
    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: 'Internal admin authorization error' });
  }
}

// --- CREATE EVENT ---
router.post('/events', verifyAdmin, async (req, res) => {
  try {
    const { title, entryFee, prizePool, maxParticipants, gameId } = req.body;

    if (!title || entryFee === undefined || !prizePool) {
      return res.status(400).json({ error: 'Title, entry fee, and prize pool are required' });
    }

    const newEvent = new Event({
      gameId: gameId || 'helix_jump',
      title: title.trim(),
      entryFee: parseInt(entryFee),
      prizePool: parseInt(prizePool),
      maxParticipants: maxParticipants ? parseInt(maxParticipants) : 5,
      status: 'waiting',
      participants: [],
      scores: new Map(),
      winnerName: '',
      winnerScore: 0,
      cooldownEndsAt: null
    });

    await newEvent.save();
    res.status(201).json(newEvent);
  } catch (error) {
    res.status(500).json({ error: 'Server error creating event' });
  }
});

// --- UPDATE EVENT ---
router.put('/events/:id', verifyAdmin, async (req, res) => {
  try {
    const { title, entryFee, prizePool, maxParticipants } = req.body;
    
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (title) event.title = title.trim();
    if (entryFee !== undefined) event.entryFee = parseInt(entryFee);
    if (prizePool) event.prizePool = parseInt(prizePool);
    if (maxParticipants) event.maxParticipants = parseInt(maxParticipants);

    await event.save();
    res.json(event);
  } catch (error) {
    res.status(500).json({ error: 'Server error updating event' });
  }
});

// --- DELETE EVENT ---
router.delete('/events/:id', verifyAdmin, async (req, res) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error deleting event' });
  }
});

// --- GET ALL WITHDRAWAL REQUESTS ---
router.get('/withdrawals', verifyAdmin, async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({}).sort({ createdAt: -1 });
    res.json(withdrawals);
  } catch (error) {
    res.status(500).json({ error: 'Server error listing withdrawals' });
  }
});

// --- APPROVE/REJECT WITHDRAWAL ---
router.post('/withdrawals/:id/status', verifyAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!status || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status approved or rejected required' });
    }

    const withdrawal = await Withdrawal.findById(req.params.id);
    if (!withdrawal) {
      return res.status(404).json({ error: 'Withdrawal request not found' });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ error: 'Request is already processed' });
    }

    withdrawal.status = status;
    await withdrawal.save();

    // If rejected, refund coins back to the user
    if (status === 'rejected') {
      const user = await User.findById(withdrawal.userId);
      if (user) {
        user.coins += withdrawal.coins;
        await user.save();
      }
    }

    res.json(withdrawal);
  } catch (error) {
    res.status(500).json({ error: 'Server error updating withdrawal status' });
  }
});

// --- ADD COINS TO USER ---
router.post('/users/add-coins', verifyAdmin, async (req, res) => {
  try {
    const { identifier, coins } = req.body;
    if (!identifier || coins === undefined) {
      return res.status(400).json({ error: 'User identifier and coins amount are required' });
    }

    const cleanId = identifier.trim().toLowerCase();
    const user = await User.findOne({
      $or: [
        { email: cleanId },
        { phone: identifier.trim() }
      ]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.coins += parseInt(coins);
    if (user.coins < 0) user.coins = 0;
    await user.save();

    res.json({
      message: `Successfully adjusted coins by ${coins} for user ${user.name}`,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        coins: user.coins
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error adjusting user coins' });
  }
});

module.exports = router;
