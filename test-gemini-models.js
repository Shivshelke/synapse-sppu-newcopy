const fetch = require('node-fetch');
require('dotenv').config();
async function run() {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.models) {
      console.log("Available Models:");
      data.models.forEach(m => console.log(m.name));
    } else {
      console.log("Error:", data);
    }
  } catch (e) { console.error(e.message); }
}
run();
