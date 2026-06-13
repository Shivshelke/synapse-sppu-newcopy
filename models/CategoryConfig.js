const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  key: { type: String, default: 'years_config', unique: true },
  years: {
    type: mongoose.Schema.Types.Mixed,
    default: {
      first: {
        label: "1st Year",
        branches: ["FE"],
        subjects: [
          "Engineering Mathematics – I",
          "Engineering Mathematics – II",
          "Engineering Physics",
          "Engineering Chemistry",
          "Basic Electrical Engineering",
          "Basic Electronics Engineering",
          "Engineering Graphics",
          "Engineering Mechanics",
          "Fundamentals of Programming Languages",
          "Programming and Problem Solving"
        ]
      },
      second: {
        label: "2nd Year",
        branches: [
          "Computer Engineering",
          "Information Technology",
          "AIML",
          "Electronics & Telecommunication",
          "Mechanical Engineering",
          "Civil Engineering",
          "Electrical Engineering",
          "Chemical Engineering",
          "Instrumentation Engineering",
          "Production Engineering"
        ],
        subjects: {}
      },
      third: {
        label: "3rd Year",
        branches: [
          "Computer Engineering",
          "Information Technology",
          "AIML",
          "Electronics & Telecommunication",
          "Mechanical Engineering",
          "Civil Engineering",
          "Electrical Engineering",
          "Chemical Engineering",
          "Instrumentation Engineering",
          "Production Engineering"
        ],
        subjects: {}
      },
      fourth: {
        label: "4th Year",
        branches: [
          "Computer Engineering",
          "Information Technology",
          "AIML",
          "Electronics & Telecommunication",
          "Mechanical Engineering",
          "Civil Engineering",
          "Electrical Engineering",
          "Chemical Engineering",
          "Instrumentation Engineering",
          "Production Engineering"
        ],
        subjects: {}
      }
    }
  }
});

module.exports = mongoose.model('CategoryConfig', schema);
