const db = require('../config/database');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const { generateResponse } = require('./claude');
const { sendMessage } = require('./instagram');
const { sendEscalationAlert, sendFollowUpNotification } = require('./alerting');

/**
 * Find users eligible for follow-up:
 * - last_message_at is 20-24 hours ago
 * - follow_up_count = 0 (never sent follow-up)
 * - qualification_stage < 8 (not already booked)
 */
async function findEligibleUsers() {
  try {
    const result = await db.query(`
      SELECT * FROM users
      WHERE last_message_at IS NOT NULL
        AND (NOW() - last_message_at) BETWEEN interval '1 hour' AND interval '24 hours'
        AND follow_up_count = 0
        AND qualification_stage < 8
        AND automation_enabled = true
      ORDER BY last_message_at ASC
    `);
    return result.rows;
  } catch (error) {
    console.error('[FOLLOWUP] findEligibleUsers error:', error);
    return [];
  }
}

/**
 * Generate contextual follow-up using Claude
 */
async function generateFollowUpMessage(user) {
  try {
    // Get last 3 messages from conversation
    const history = await Conversation.getHistory(user.user_id, 3);
    
    if (history.length === 0) {
      console.log(`[FOLLOWUP] No history for ${user.user_id}, skipping`);
      return null;
    }

    // Create special follow-up prompt for Claude
    const followUpUser = {
      ...user,
      isFollowUp: true  // Flag for Claude to know it's a follow-up
    };

    // Modify the last message to indicate silence
    const modifiedHistory = [...history];
    modifiedHistory.push({
      sender: 'system',
      message: `[USER HAS BEEN SILENT FOR 20 HOURS. GENERATE A GENTLE FOLLOW-UP MESSAGE BASED ON CONVERSATION CONTEXT. Reference what was discussed. Be warm and not pushy. Do NOT start over - continue from where you left off. Example: "Hey! Did you get a chance to pick a time? Let me know if you need help!"]`
    });

    const claudeResponse = await generateResponse(modifiedHistory, followUpUser);
    
    return claudeResponse.response;
  } catch (error) {
    console.error(`[FOLLOWUP] Claude error for ${user.user_id}:`, error);
    return null;
  }
}

/**
 * Send follow-up to a specific user
 */
async function sendFollowUp(user) {
  try {
    console.log(`[FOLLOWUP] Processing ${user.user_id}, stage: ${user.qualification_stage}`);
    return true;  // ← Add this

    // ← ADD THIS: Get last 3 messages BEFORE generating follow-up
    const history = await Conversation.getHistory(user.user_id, 3);

    // Skip if no history - prevents errors
    if (!history || history.length === 0) {
      console.log(`[FOLLOWUP] No conversation history for ${user.user_id}, skipping`);
      return false;
    }

    // Generate contextual message
    const followUpMessage = await generateFollowUpMessage(user);
    
    if (!followUpMessage) {
      console.log(`[FOLLOWUP] No message generated for ${user.user_id}`);
      return false;  // ← Return false if no message
    }

    // Split messages if Claude used |||
    const messages = followUpMessage.split('|||').map(m => m.trim()).filter(m => m.length > 0);

    console.log(`[FOLLOWUP] Sending ${messages.length} follow-up messages to ${user.user_id}`);

    // Send each message with delay
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      
      await sendMessage(user.user_id, msg);
      console.log(`[FOLLOWUP] Sent to ${user.user_id}: "${msg.substring(0, 40)}..."`);

      // Save follow-up to conversations
      await Conversation.saveMessage(
        user.user_id,
        'assistant',
        msg,
        null,
        user.latest_next_action,
        user.qualification_stage
      );

      // Wait 3 seconds between messages
      if (i < messages.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    // Update follow_up_count and timestamp
    await db.query(`
      UPDATE users 
      SET follow_up_sent_at = NOW(),
          follow_up_count = follow_up_count + 1,
          updated_at = NOW()
      WHERE user_id = $1
    `, [user.user_id]);

    // ← ADD THIS: Send notification email with user details and message
    await sendFollowUpNotification(user, followUpMessage, history);

    console.log(`[FOLLOWUP] ✅ Follow-up complete for ${user.user_id}`);
    return true;  // ← ADD HERE (end of try block, after log)

  } catch (error) {
    console.error(`[FOLLOWUP] Error for ${user.user_id}:`, error);
    
    // Alert admin
    await sendEscalationAlert(
      error,
      `Follow-up failed for user: ${user.user_id}`,
      null
    );

    return false;  // ← ADD HERE (end of catch block)
  }
}
/**
 * Main background job - runs every 15 minutes
 */
async function runFollowUpJob() {
  try {
    console.log('[FOLLOWUP JOB] Starting follow-up check...');
    
    const eligibleUsers = await findEligibleUsers();
    console.log(`[FOLLOWUP JOB] Found ${eligibleUsers.length} eligible users`);

    if (eligibleUsers.length === 0) {
      console.log('[FOLLOWUP JOB] No follow-ups needed');
      return;
    }

    let sentCount = 0;  // ← Track actual sends

    // Process each user (space out sends to avoid rate limits)
    for (const user of eligibleUsers) {
      const result = await sendFollowUp(user);
      if (result) sentCount++;  // ← Increment only on success
      
      // Wait 5 seconds between users
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    console.log(`[FOLLOWUP JOB] ✅ Completed. Sent ${sentCount}/${eligibleUsers.length} follow-ups`);

  } catch (error) {
    console.error('[FOLLOWUP JOB] Job error:', error);
  }
}

module.exports = { runFollowUpJob, sendFollowUp, findEligibleUsers };