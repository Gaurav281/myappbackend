const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
  gameId: {
    type: String,
    default: 'helix_jump',
  },
  title: {
    type: String,
    required: true,
  },
  entryFee: {
    type: Number,
    required: true,
    default: 0,
  },
  prizePool: {
    type: Number,
    required: true,
  },
  maxParticipants: {
    type: Number,
    default: 5,
  },
  status: {
    type: String,
    enum: ['waiting', 'playing', 'finished'],
    default: 'waiting',
  },
  participants: [
    {
      id: { type: String, required: true },
      name: { type: String, required: true },
      isBot: { type: Boolean, default: false }
    }
  ],
  scores: {
    type: Map,
    of: Number,
    default: {}
  },
  winnerName: {
    type: String,
    default: '',
  },
  winnerScore: {
    type: Number,
    default: 0,
  },
  cooldownEndsAt: {
    type: Date,
    default: null,
  }
}, { timestamps: true });

module.exports = mongoose.model('Event', EventSchema);
