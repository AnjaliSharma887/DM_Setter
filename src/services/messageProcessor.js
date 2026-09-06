const User = require('../models/User');
const Conversation = require('../models/Conversation');
const { generateResponse } = require('./claude');
const { sendMessage } = require('./instagram');
const { sendEscalationAlert } = require('./alerting');
const db = require('../config/database');

// ============ MESSAGE DEBOUNCING ============
// Store pending messages per user
const pendingMessages = {};
const DEBOUNCE_TIME = 15000; // 10 seconds

/**
 * Queue message and wait for more messages before processing
 * If no new message arrives in 10 seconds, process all queued messages
 */
function queueMessage(senderId, messageText, messageId) {
  // If user already has pending messages, add to queue
  if (pendingMessages[senderId]) {
    pendingMessages[senderId].messages.push(messageText);
    pendingMessages[senderId].messageIds.push(messageId);
    
    console.log(`[DEBOUNCE] Adding to queue for ${senderId}. Total: ${pendingMessages[senderId].messages.length} messages`);
    
    // Reset the timer - keep waiting for more messages
    clearTimeout(pendingMessages[senderId].timer);
  } else {
    // First message from this user - start queue
    pendingMessages[senderId] = {
      messages: [messageText],
      messageIds: [messageId],
      firstMessageTime: Date.now()
    };
    
    console.log(`[DEBOUNCE] Started queue for ${senderId}`);
  }

  // Set timer: process after 10 seconds of silence
  pendingMessages[senderId].timer = setTimeout(async () => {
    // Combine all messages into one
    const combinedMessage = pendingMessages[senderId].messages.join('\n');
    const messageIds = pendingMessages[senderId].messageIds;
    const totalMessages = pendingMessages[senderId].messages.length;
    
    // Clear the pending queue for this user
    delete pendingMessages[senderId];
    
    console.log(`[DEBOUNCE] Processing ${totalMessages} messages from ${senderId} after 10s wait`);
    console.log(`[DEBOUNCE] Combined text: "${combinedMessage}"`);
    
    // Now process the combined message
    try {
      await processMessage(senderId, combinedMessage, messageIds[0]);
    } catch (error) {
      console.error(`[DEBOUNCE] Error processing combined messages:`, error);
    }
  }, DEBOUNCE_TIME);
}

// ============ ORIGINAL PROCESS MESSAGE ============
async function processMessage(senderId, messageText, messageId) {
  let claudeResponse = null;  // ← Track Claude's response for escalation

  try {
    console.log(`Processing message from ${senderId}: "${messageText}"`);

    // Step 1: Find or create user
    const user = await User.findOrCreate(senderId);
    console.log(`User found/created: ${senderId}, stage: ${user.qualification_stage}`);

    // ← ADD THIS CHECK
    // If user came from comment flow and just answered the pain point question
    if (user.came_from_comment && user.qualification_stage === 2) {
      console.log(`[COMMENT FLOW] Capturing pain point for ${senderId}`);

      // Only auto-enable automation if explicitly allowed (safety for testing)
      const shouldAutoEnable = process.env.AUTO_ENABLE_COMMENT_FLOW === 'true';
      
      // Store the pain point (user's answer)
      await db.query(
        `UPDATE users 
         SET pain_points = $1, 
             qualification_stage = 5,
             automation_enabled = CASE WHEN $3 = true THEN true ELSE automation_enabled END
         WHERE user_id = $2`,
        [messageText, senderId, shouldAutoEnable]
      );
      console.log(`[COMMENT FLOW] Stored pain_points, auto-enable: ${shouldAutoEnable}`);
    }

    if (!user.automation_enabled) {
      console.log(`[DISABLED] Automation off for ${senderId}, skipping processing`);
      return;  // Exit early, don't process
    }

    // Step 2: Save incoming message to database
    await Conversation.saveMessage(senderId, 'user', messageText, messageId);
    console.log(`Saved user message to database`);

    // ← ADD THIS: Reset follow-up when user replies
    await db.query(`
      UPDATE users 
      SET follow_up_count = 0, follow_up_sent_at = NULL 
      WHERE user_id = $1
    `, [senderId]);
    console.log(`Reset follow-up count for ${senderId}`);

    // Step 3: Get conversation history (last 10 messages)
    const history = await Conversation.getHistory(senderId, 10);
    console.log(`Retrieved ${history.length} messages from history`);

    // Step 5: Call Claude for intelligent response
    claudeResponse = await generateResponse(history, user);
    console.log(`Claude response: ${JSON.stringify(claudeResponse)}`);

    // Step 6: Update latest action in users table
    await User.updateLatestAction(
      senderId,
      claudeResponse.next_action,
      claudeResponse.qualification_stage
    );
    console.log(`Updated user latest_action to: ${claudeResponse.next_action}`);

    // Step 6b: Extract and save user data from Claude's response
    if (claudeResponse.extracted_data) {
      const data = claudeResponse.extracted_data;
      const stageToSave = claudeResponse.qualification_stage || user.qualification_stage;
      const fieldsToSave = {
        country: data.country,
        roles: data.roles,
        experience: (data.experience_years && !isNaN(parseInt(data.experience_years))) 
        ? parseInt(data.experience_years) 
        : null,
        applicationStatus: data.application_status,
        painPoints: data.pain_points
      };

      await User.updateStage(senderId, stageToSave, fieldsToSave);

      if (data.qualified !== null && data.qualified !== undefined) {
        await User.updateQualification(senderId, data.qualified);
      }

      // Save disqualification reason (only when disqualified)
      if (data.disqualified_reason) {
        await db.query(
          `UPDATE users SET disqualified_reason = $1 WHERE user_id = $2`,
          [data.disqualified_reason, senderId]
        );
        console.log(`Saved disqualified_reason: ${data.disqualified_reason} for ${senderId}`);
      }
    }

    // Step 7: Split and send response with delays
    const messages = claudeResponse.response.split('|||').map(m => m.trim()).filter(m => m.length > 0);
    console.log(`[SPLIT] Sending ${messages.length} messages with delays`);

    const lastMessage = await Conversation.getLastMessage(senderId);
    const lastStage = claudeResponse.qualification_stage || lastMessage?.qualification_stage;
    const lastAction = claudeResponse.next_action || lastMessage?.next_action;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      await sendMessage(senderId, msg);
      console.log(`[SPLIT] Sent message ${i + 1}/${messages.length}: "${msg.substring(0, 40)}..."`);

      await Conversation.saveMessage(
        senderId,
        'assistant',
        msg,
        messageId,
        lastAction,
        lastStage
      );

      if (i < messages.length - 1) {
        console.log(`[SPLIT] Waiting 3s before next message...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    console.log(`Response sent to Instagram: "${claudeResponse.response.substring(0, 50)}..."`);

    // Step 8: Update last message timestamp
    await User.updateLastMessage(senderId);

    return claudeResponse;

  } catch (error) {
    console.error(`Error processing message from ${senderId}:`, error);

    // Send fallback message
    try {
      await sendMessage(senderId, "Thanks for your message! Let me check on that and get back to you shortly.");
    } catch (sendError) {
      console.error('Failed to send fallback message:', sendError);
    }

    // Send escalation alert with Claude's response
    await sendEscalationAlert(
      error,
      `User: ${senderId}, Message: "${messageText.substring(0, 50)}..."`,
      claudeResponse?.response  // ← Includes Claude's response if generated
    );

    throw error;
  }
}

module.exports = { processMessage, queueMessage };