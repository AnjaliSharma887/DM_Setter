require('dotenv').config();
const { generateResponse } = require('../services/claude');

// Simulate a conversation
async function testConversation() {
  console.log('Testing Claude integration...\n');

  // Test 1: First message
  console.log('--- TEST 1: First message ---');
  const response1 = await generateResponse(
    [{ sender: 'user', message: 'Hi, can you help me find job in UK?' }],
    { qualification_stage: 1 }
  );
  console.log('Emma:', response1.response);
  console.log('Action:', response1.next_action);
  console.log('Stage:', response1.qualification_stage);
  console.log('Data:', response1.extracted_data);
  console.log('');

  // Test 2: User provides country
  console.log('--- TEST 2: Country provided ---');
  const response2 = await generateResponse(
    [
      { sender: 'user', message: 'Hi, can you help me find job in UK?' },
      { sender: 'assistant', message: response1.response },
      { sender: 'user', message: 'I am based in the UK' }
    ],
    { qualification_stage: 1, country: null }
  );
  console.log('Emma:', response2.response);
  console.log('Data:', response2.extracted_data);
  console.log('');

  // Test 3: Multi-answer message
  console.log('--- TEST 3: Multi-answer ---');
  const response3 = await generateResponse(
    [
      { sender: 'user', message: 'Hi, I am based in US, looking for data analyst roles, 2 years experience, struggling with resume and interviews' }
    ],
    { qualification_stage: 1 }
  );
  console.log('Emma:', response3.response);
  console.log('Data:', response3.extracted_data);
  console.log('');

  // Test 4: Off-topic question
  console.log('--- TEST 4: Off-topic (budget) ---');
  const response4 = await generateResponse(
    [
      { sender: 'user', message: 'Hi' },
      { sender: 'assistant', message: 'Hey, thank you for your message! I am Emma, an assistant for Mingke. To start, could you please let me know which country you are currently based in?' },
      { sender: 'user', message: 'How much does this cost?' }
    ],
    { qualification_stage: 1 }
  );
  console.log('Emma:', response4.response);
  console.log('');

  // Test 5: Disqualification
  console.log('--- TEST 5: Disqualification (wrong country) ---');
  const response5 = await generateResponse(
    [
      { sender: 'user', message: 'Hi' },
      { sender: 'assistant', message: 'Hey, thank you for your message! I am Emma, an automated assistant for Mingke. To start, could you please let me know which country you are currently based in?' },
      { sender: 'user', message: 'I am based in India' }
    ],
    { qualification_stage: 1 }
  );
  console.log('Emma:', response5.response);
  console.log('Action:', response5.next_action);
  console.log('');

  console.log('All tests complete!');
}

testConversation().catch(console.error);
