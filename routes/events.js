const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const User = require('../models/User');

// --- HELPER: DECLARE WINNER AND DISTRIBUTE PRIZE ---
async function checkAndDeclareWinner(event) {
  const participants = event.participants;
  const scores = event.scores || new Map();

  // Check if all participants have a score
  let allSubmitted = true;
  for (const p of participants) {
    if (!scores.has(p.id)) {
      allSubmitted = false;
      break;
    }
  }

  if (!allSubmitted) return;

  // Find winner
  let winnerId = '';
  let winnerName = '';
  let maxScore = -1;

  for (const p of participants) {
    const pScore = scores.get(p.id) || 0;
    if (pScore > maxScore) {
      maxScore = pScore;
      winnerId = p.id;
      winnerName = p.name;
    }
  }

  // Update Event
  event.status = 'finished';
  event.winnerName = winnerName;
  event.winnerScore = maxScore;
  event.cooldownEndsAt = new Date(Date.now() + 45 * 1000); // 45s cooldown
  await event.save();

  // Award prize (only if winner is a real user - bots don't need real coins, but if winnerId starts with user_, update)
  if (winnerId.startsWith('user_') || !winnerId.startsWith('bot_')) {
    try {
      const user = await User.findById(winnerId);
      if (user) {
        user.coins += event.prizePool;
        await user.save();
      }
    } catch (e) {
      console.error('Failed to credit prize pool to user:', e);
    }
  }

  // Schedule reset timer
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
        console.log(`Event ${freshEvent.title} reset successfully.`);
      }
    } catch (err) {
      console.error('Failed to reset event after cooldown:', err);
    }
  }, 45 * 1000);
}

// --- HELPER: SIMULATE BOT JOINING AND SCORING ---
function runOpponentSimulation(eventId) {
  let joinCount = 0;
  const interval = setInterval(async () => {
    try {
      const event = await Event.findById(eventId);
      if (!event || event.status !== 'waiting') {
        clearInterval(interval);
        return;
      }

      if (event.participants.length < event.maxParticipants) {
        const botNames = ['CyberGamer', 'HelixPro', 'AlphaNeo', 'NeonKnight', 'SpeedyBall', 'NinjaJump', 'GravityMaster'];
        const randomName = `${botNames[Math.floor(Math.random() * botNames.length)]}_${Math.floor(10 + Math.random() * 90)}`;
        
        event.participants.push({
          id: `bot_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          name: randomName,
          isBot: true
        });

        await event.save();

        if (event.participants.length >= event.maxParticipants) {
          event.status = 'playing';
          await event.save();
          clearInterval(interval);

          // Once playing, schedule bot score submissions
          simulateBotScores(eventId);
        }
      } else {
        clearInterval(interval);
      }
    } catch (err) {
      console.error('Error in bot join simulation:', err);
      clearInterval(interval);
    }
  }, 2500);
}

function simulateBotScores(eventId) {
  setTimeout(async () => {
    try {
      const event = await Event.findById(eventId);
      if (!event || event.status !== 'playing') return;

      const scores = event.scores || new Map();
      event.participants.forEach(p => {
        if (p.isBot) {
          // Bots score between 60 and 380
          scores.set(p.id, Math.floor(60 + Math.random() * 320));
        }
      });

      event.scores = scores;
      await event.save();

      // Check if all submitted (in case user submitted score first)
      await checkAndDeclareWinner(event);
    } catch (err) {
      console.error('Error in bot score simulation:', err);
    }
  }, 8000); // Bots submit score after 8 seconds of playing
}

// --- GET ALL EVENTS ---
router.get('/', async (req, res) => {
  try {
    const events = await Event.find({});
    
    // Check if any event has completed cooldown in background but hasn't reset
    const updatedEvents = await Promise.all(events.map(async (event) => {
      if (event.status === 'finished' && event.cooldownEndsAt && event.cooldownEndsAt <= new Date()) {
        event.status = 'waiting';
        event.participants = [];
        event.scores = new Map();
        event.winnerName = '';
        event.winnerScore = 0;
        event.cooldownEndsAt = null;
        await event.save();
      }
      return event;
    }));

    res.json(updatedEvents);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching events' });
  }
});

// --- JOIN EVENT ---
router.post('/:id/join', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (event.status !== 'waiting') {
      return res.status(400).json({ error: 'Event has already started or completed' });
    }

    // Check duplicate join
    const alreadyJoined = event.participants.some(p => p.id === userId);
    if (alreadyJoined) {
      return res.status(400).json({ error: 'You have already joined this event' });
    }

    if (event.participants.length >= event.maxParticipants) {
      return res.status(400).json({ error: 'Tournament registration is full' });
    }

    // Check entry fee
    if (user.coins < event.entryFee) {
      return res.status(400).json({ error: `Insufficient coins. Entry fee is ${event.entryFee} coins` });
    }

    // Deduct coins
    if (event.entryFee > 0) {
      user.coins -= event.entryFee;
      await user.save();
    }

    // Join
    event.participants.push({
      id: user._id.toString(),
      name: user.name,
      isBot: false
    });

    await event.save();

    // Trigger opponent bot simulation if not full yet
    if (event.participants.length < event.maxParticipants) {
      runOpponentSimulation(event._id);
    } else {
      // If full (e.g. 5 real players), start match immediately
      event.status = 'playing';
      await event.save();
    }

    res.json({ event, userCoins: user.coins });
  } catch (error) {
    res.status(500).json({ error: 'Server error joining event' });
  }
});

// --- SUBMIT SCORE ---
router.post('/:id/score', async (req, res) => {
  try {
    const { userId, score } = req.body;
    if (!userId || score === undefined) {
      return res.status(400).json({ error: 'User ID and score are required' });
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (event.status !== 'playing') {
      return res.status(400).json({ error: 'Score submission is only open during matches' });
    }

    const scores = event.scores || new Map();
    scores.set(userId, parseInt(score));
    event.scores = scores;

    await event.save();

    // Declare winner check
    await checkAndDeclareWinner(event);

    res.json(event);
  } catch (error) {
    res.status(500).json({ error: 'Server error submitting score' });
  }
});

module.exports = {
  router,
  checkAndDeclareWinner
};
