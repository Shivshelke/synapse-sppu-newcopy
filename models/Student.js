const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email:    { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isPremium: { type: Boolean, default: false },
  premiumStatus: { type: String, enum: ['none', 'pending', 'active'], default: 'none' },
  requestedAt: { type: Date },
  registeredAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Student', schema);
