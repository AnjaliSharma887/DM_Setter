const User = require('../models/User');
const Conversation = require('../models/Conversation');
const { generateResponse } = require('./claude');
const { sendMessage } = require('./instagram');

async function processMessage(senderId, messageText, messageId) {
  try {
    console.log(`Processing message from ${senderId}: "${messageText}"`);

    // Step 1: Find or create user
    const user = await User.findOrCreate(senderId);
    console.log(`User found/created: ${senderId}, stage: ${user.qualification_stage}`);

    // Step 2: Save incoming message to database
    await Conversation.saveMessage(senderId, 'user', messageText, messageId);
    console.log(`Saved user message to database`);

    // Step 3: Get conversation history (last 10 messages)
    const history = await Conversation.getHistory(senderId, 10);
    console.log(`Retrieved ${history.length} messages from history`);

    // Step 4: Check for duplicate message
    // If last assistant message was sent less than 5 seconds ago, skip
    const lastAssistantMsg = history.filter(m => m.sender === 'assistant').pop();
    if (lastAssistantMsg) {
      const timeDiff = Date.now() - new Date(lastAssistantMsg.timestamp).getTime();
      if (timeDiff < 5000) {
        console.log(`Duplicate detected (${timeDiff}ms since last response). Skipping.`);
        return;
      }
    }

    // Step 5: Call Claude for intelligent response
    const claudeResponse = await generateResponse(history, user);
    console.log(`Claude response: ${JSON.stringify(claudeResponse)}`);

    // Step 6: Extract and save user data from Claude's response
    if (claudeResponse.extracted_data) {
      const data = claudeResponse.extracted_data;
      await User.updateStage(senderId, claudeResponse.qualification_stage || user.qualification_stage, {
        country: data.country,
        roles: data.roles,
        experience: data.experience_years ? parseInt(data.experience_years) : null,
        applicationStatus: data.application_status,
        painPoints: data.pain_points
      });

      // Update qualification status
      if (data.qualified !== null && data.qualified !== undefined) {
        await User.updateQualification(senderId, data.qualified);
      }
    }

    // Step 7: Save Emma's response to database
    await Conversation.saveMessage(senderId, 'assistant', claudeResponse.response);
    console.log(`Saved assistant response to database`);

    // Step 8: Send response via Instagram API
    await sendMessage(senderId, claudeResponse.response);
    console.log(`Response sent to Instagram: "${claudeResponse.response.substring(0, 50)}..."`);

    // Step 9: Update last message timestamp
    await User.updateLastMessage(senderId);

    return claudeResponse;

  } catch (error) {
    console.error(`Error processing message from ${senderId}:`, error);
    
    // Send fallback message if something goes wrong
    try {
      await sendMessage(senderId, "Thanks for your message! Let me check on that and get back to you shortly.");
    } catch (sendError) {
      console.error('Failed to send fallback message:', sendError);
    }
    
    throw error;
  }
}

module.exports = { processMessage };
