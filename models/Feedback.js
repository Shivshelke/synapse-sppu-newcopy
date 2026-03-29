const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  name:    { type: String, default: 'Anonymous' },
  message: { type: String, required: true },
  date:    { type: Date, default: Date.now }
});
module.exports = mongoose.model('Feedback', schema);
