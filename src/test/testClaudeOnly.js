require('dotenv').config();
const { generateResponse } = require('../services/claude');

async function testClaudeOnly() {
  console.log('🚀 TESTING CLAUDE API ONLY\n');

  // Fake conversation history (no database)
  const fakeHistory = [
    { sender: 'user', message: 'Hi, I need help with my career' }
  ];

  const fakeUserProfile = {
    qualification_stage: 1,
    country: null
  };

  try {
    console.log('📡 Calling Claude API...\n');
    const response = await generateResponse(fakeHistory, fakeUserProfile);

    console.log('✅ Claude Response:');
    console.log(`Response: ${response.response}`);
    console.log(`Action: ${response.next_action}`);
    console.log(`Stage: ${response.qualification_stage}`);
    console.log(`\n✅ CLAUDE API WORKS!`);
  } catch (error) {
    console.error('❌ Claude error:', error);
  }
}

testClaudeOnly().catch(console.error);