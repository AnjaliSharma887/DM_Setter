require('dotenv').config();
const axios = require('axios');
const { generateResponse } = require('../services/claude');
const Conversation = require('../models/Conversation');
const User = require('../models/User');

// Your Instagram credentials
const PAGE_ID = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const TEST_USER_ID = '_ams_jewels_'

// Step 1: Get conversations (fetch existing DMs)
async function getConversations() {
  console.log('\n=== FETCHING CONVERSATIONS ===\n');
  
  try {
    const response = await axios.get(
      `https://graph.instagram.com/v26.0/me/conversations`,
      {
        params: {
          platform: 'instagram',
          access_token: ACCESS_TOKEN
        }
      }
    );

    console.log('Conversations:', JSON.stringify(response.data, null, 2));
    return response.data.data;
  } catch (error) {
    console.error('Error fetching conversations:', error.response?.data || error.message);
  }
}

// Step 2: Get messages in a conversation
async function getConversationMessages(conversationId) {
  console.log(`\n=== FETCHING MESSAGES FROM CONVERSATION: ${conversationId} ===\n`);
  
  try {
    const response = await axios.get(
      `https://graph.instagram.com/v26.0/${conversationId}`,
      {
        params: {
          fields: 'messages',
          access_token: ACCESS_TOKEN
        }
      }
    );

    console.log('Messages:', JSON.stringify(response.data.messages.data, null, 2));
    return response.data.messages.data;
  } catch (error) {
    console.error('Error fetching messages:', error.response?.data || error.message);
  }
}

// Step 3: Get message details
async function getMessageDetails(messageId) {
  console.log(`\n=== FETCHING MESSAGE DETAILS: ${messageId} ===\n`);
  
  try {
    const response = await axios.get(
      `https://graph.instagram.com/v26.0/${messageId}`,
      {
        params: {
          fields: 'id,created_time,from,to,message',
          access_token: ACCESS_TOKEN
        }
      }
    );

    console.log('Message Details:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('Error fetching message details:', error.response?.data || error.message);
  }
}

// Step 4: Simulate receiving a message and process with Claude
async function simulateIncomingMessage(senderId, messageText) {
  console.log(`\n=== SIMULATING INCOMING MESSAGE ===`);
  console.log(`From: ${senderId}`);
  console.log(`Message: ${messageText}\n`);

  try {
    // Step 1: Find or create user
    const user = await User.findOrCreate(senderId);
    console.log(`✅ User created/found: ${senderId}`);

    // Step 2: Save incoming message
    await Conversation.saveMessage(senderId, 'user', messageText);
    console.log(`✅ Message saved to database`);

    // Step 3: Get conversation history
    const history = await Conversation.getHistory(senderId, 10);
    console.log(`✅ Retrieved ${history.length} messages from history`);

    // Step 4: Call Claude
    console.log(`\n📡 Calling Claude API...`);
    const claudeResponse = await generateResponse(history, user);
    console.log(`✅ Claude responded:\n`);
    console.log(`Response: ${claudeResponse.response}`);
    console.log(`Action: ${claudeResponse.next_action}`);
    console.log(`Stage: ${claudeResponse.qualification_stage}`);
    console.log(`Data: ${JSON.stringify(claudeResponse.extracted_data, null, 2)}`);

    // Step 5: Save Emma's response
    await Conversation.saveMessage(senderId, 'assistant', claudeResponse.response);
    console.log(`\n✅ Emma's response saved to database`);

    // Step 6: Send response via Instagram API
    console.log(`\n📤 Sending response via Instagram API...`);
    const sendResponse = await sendMessageViaInstagram(senderId, claudeResponse.response);
    console.log(`✅ Response sent! Message ID: ${sendResponse.message_id}`);

    return claudeResponse;

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Step 5: Send message via Instagram API
async function sendMessageViaInstagram(recipientId, messageText) {
  console.log(`Sending to: ${recipientId}`);
  console.log(`Text: ${messageText}\n`);

  try {
    const response = await axios.post(
      `https://graph.instagram.com/v26.0/${PAGE_ID}/messages`,
      {
        recipient: { id: recipientId },
        messaging_type: 'RESPONSE',
        message: { text: messageText }
      },
      {
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error sending message:', error.response?.data || error.message);
    throw error;
  }
}

// Main test function
async function runTests() {
  console.log('🚀 STARTING GRAPH API TESTS\n');

  // Test 1: Fetch existing conversations
  console.log('TEST 1: Fetch Conversations');
  const conversations = await getConversations();

  // Test 2: If conversations exist, fetch messages
  if (conversations && conversations.length > 0) {
    console.log('\nTEST 2: Fetch Messages from first conversation');
    const messages = await getConversationMessages(conversations[0].id);

    // Test 3: Fetch details of first message
    if (messages && messages.length > 0) {
      console.log('\nTEST 3: Fetch Message Details');
      await getMessageDetails(messages[0].id);
    }
  }

  // Test 4: Simulate incoming message and process with Claude
  console.log('\n\nTEST 4: Simulate Incoming Message + Claude Processing');
  await simulateIncomingMessage(
    TEST_USER_ID,
    'Hi, I am looking for help with my career'
  );

  // Test 5: Send another message to continue conversation
  console.log('\n\nTEST 5: Continue Conversation');
  await simulateIncomingMessage(
    TEST_USER_ID,
    'I am based in the UK'
  );

  console.log('\n\n✅ ALL TESTS COMPLETE!');
}

// Run
runTests().catch(console.error);