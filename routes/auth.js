const express = require('express');
const router = express.Router();
const User = require('../models/User');

// --- SIGN UP ---
router.post('/signup', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();

    // Check if user already exists (email or phone)
    const existingUser = await User.findOne({
      $or: [
        { email: cleanEmail },
        { phone: cleanPhone }
      ]
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email or phone number already registered' });
    }

    const newUser = new User({
      name: name.trim(),
      email: cleanEmail,
      phone: cleanPhone,
      password: password, // Note: In production we'd encrypt password, but keeping plain-text matching as per local flow.
    });

    await newUser.save();
    res.status(201).json({
      id: newUser._id,
      name: newUser.name,
      email: newUser.email,
      phone: newUser.phone,
      coins: newUser.coins,
      isAdmin: newUser.isAdmin
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error during signup' });
  }
});

// --- LOG IN ---
router.post('/login', async (req, res) => {
  try {
    const { loginId, password } = req.body;

    if (!loginId || !password) {
      return res.status(400).json({ error: 'Login ID and password are required' });
    }

    const cleanLoginId = loginId.trim().toLowerCase();

    // Find by email or phone
    const user = await User.findOne({
      $or: [
        { email: cleanLoginId },
        { phone: loginId.trim() }
      ]
    });

    if (!user || user.password !== password) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      coins: user.coins,
      isAdmin: user.isAdmin
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error during login' });
  }
});

// --- PROFILE ---
router.get('/profile/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      coins: user.coins,
      isAdmin: user.isAdmin
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching profile' });
  }
});

module.exports = router;
