const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  originalName: String,
  storedName:   String,
  year:         String,
  branch:       String,
  subject:      String,
  size:         Number,
  uploadDate:   { type: Date, default: Date.now },
  uploadedBy:   String,
  url:          String,
  publicId:     String,
  contentType:  { type: String, default: 'regular' }
});
module.exports = mongoose.model('File', schema);
