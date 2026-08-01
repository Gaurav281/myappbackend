require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

// Import Schemas & Routers
const authRoutes = require('./routes/auth');
const { router: eventRoutes } = require('./routes/events');
const walletRoutes = require('./routes/wallet');
const adminRoutes = require('./routes/admin');

const Event = require('./models/Event');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/admin', adminRoutes);

// Health Check API
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

// Port
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('Error: MONGODB_URI is not defined in environment variables.');
  process.exit(1);
}

const User = require('./models/User');

// Connect to MongoDB Atlas
mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('Successfully connected to MongoDB Cluster.');
    
    // Seed default admin credentials if not present
    await seedAdminUser();
    
    // Start Server
    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}...`);
      
      // Run self-healing timer recovery on server boot
      recoverEventCooldownTimers();
    });
  })
  .catch((err) => {
    console.error('Database connection failed:', err.message);
    process.exit(1);
  });

// Self-healing function to recover active cooldowns after server crashes/restarts
async function recoverEventCooldownTimers() {
  try {
    const finishedEvents = await Event.find({ status: 'finished' });
    console.log(`Found ${finishedEvents.length} events in 'finished' cooldown state on boot.`);
    
    const now = Date.now();
    for (const event of finishedEvents) {
      const cooldownEnds = event.cooldownEndsAt ? new Date(event.cooldownEndsAt).getTime() : 0;
      const remainingTime = cooldownEnds - now;
      
      if (remainingTime <= 0) {
        // Cooldown already ended, reset event immediately
        event.status = 'waiting';
        event.participants = [];
        event.scores = new Map();
        event.winnerName = '';
        event.winnerScore = 0;
        event.cooldownEndsAt = null;
        await event.save();
        console.log(`Event '${event.title}' reset immediately (cooldown expired).`);
      } else {
        // Schedule reset for the remaining time
        console.log(`Event '${event.title}' scheduling reset in ${Math.round(remainingTime / 1000)}s...`);
        setTimeout(async () => {
          try {
            const freshEvent = await Event.findById(event._id);
            if (freshEvent && freshEvent.status === 'finished') {
              freshEvent.status = 'waiting';
              freshEvent.participants = [];
              freshEvent.scores = new Map();
              freshEvent.winnerName = '';
              freshEvent.winnerScore = 0;
              freshEvent.cooldownEndsAt = null;
              await freshEvent.save();
              console.log(`Scheduled recovery reset for '${freshEvent.title}' completed.`);
            }
          } catch (err) {
            console.error('Scheduled recovery reset failed:', err);
          }
        }, remainingTime);
      }
    }
  } catch (err) {
    console.error('Failed to recover event timers:', err);
  }
}

async function seedAdminUser() {
  try {
    const ADMIN_CREDENTIALS = {
      name: 'admin',
      email: 'gg@gmail.com',
      phone: '8899284567',
      password: 'Pushpa781@#',
      isAdmin: true
    };
    
    const adminExists = await User.findOne({ email: ADMIN_CREDENTIALS.email });
    if (!adminExists) {
      const newAdmin = new User(ADMIN_CREDENTIALS);
      await newAdmin.save();
      console.log('Seeded default admin credentials successfully.');
    } else {
      console.log('Admin user already exists in database.');
    }
  } catch (err) {
    console.error('Failed to seed admin credentials:', err.message);
  }
}
