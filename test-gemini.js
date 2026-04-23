const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
async function run() {
  const models = ['gemini-2.0-flash', 'gemini-flash-latest', 'gemini-2.5-pro', 'gemini-1.5-flash-8b'];
  for (const modelName of models) {
    try {
      console.log('Testing', modelName);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent("hi");
      console.log('SUCCESS:', modelName, result.response.text().trim());
      return;
    } catch (e) { console.error('FAILED:', modelName, e.message.split('\n')[0]); }
  }
}
run();
