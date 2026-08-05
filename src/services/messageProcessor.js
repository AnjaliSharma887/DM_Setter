const User = require('../models/User');
const Conversation = require('../models/Conversation');
const { generateResponse } = require('./claude');
const { sendMessage } = require('./instagram');

// ============ MESSAGE DEBOUNCING ============
// Store pending messages per user
const pendingMessages = {};
const DEBOUNCE_TIME = 10000; // 10 seconds

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

    // Step 5: Call Claude for intelligent response
    const claudeResponse = await generateResponse(history, user);
    console.log(`Claude response: ${JSON.stringify(claudeResponse)}`);

    // #region agent log
    fetch('http://127.0.0.1:7552/ingest/306b3583-99eb-4cb6-bd0c-3a790ee371e0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f6cbd9'},body:JSON.stringify({sessionId:'f6cbd9',location:'messageProcessor.js:claudeResponse',message:'Claude JSON received',data:{hasExtractedData:!!claudeResponse.extracted_data,next_action:claudeResponse.next_action||null,qualification_stage:claudeResponse.qualification_stage||null,extracted_data:claudeResponse.extracted_data||null,responseLength:(claudeResponse.response||'').length},timestamp:Date.now(),hypothesisId:'H1-H2'})}).catch(()=>{});
    // #endregion

    // Step 6: Extract and save user data from Claude's response
    let updatedUser = null;
    if (claudeResponse.extracted_data) {
      const data = claudeResponse.extracted_data;
      const stageToSave = claudeResponse.qualification_stage || user.qualification_stage;
      const fieldsToSave = {
        country: data.country,
        roles: data.roles,
        experience: data.experience_years ? parseInt(data.experience_years) : null,
        applicationStatus: data.application_status,
        painPoints: data.pain_points
      };

      // #region agent log
      fetch('http://127.0.0.1:7552/ingest/306b3583-99eb-4cb6-bd0c-3a790ee371e0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f6cbd9'},body:JSON.stringify({sessionId:'f6cbd9',location:'messageProcessor.js:beforeDbSave',message:'Fields about to persist to users table',data:{stageToSave,fieldsToSave,qualifiedWillUpdate:data.qualified!==null&&data.qualified!==undefined,qualifiedValue:data.qualified??null,next_action_NOT_SAVED:claudeResponse.next_action||null,userBefore:{stage:user.qualification_stage,country:user.country,qualified:user.qualified}},timestamp:Date.now(),hypothesisId:'H3-H5'})}).catch(()=>{});
      // #endregion

      updatedUser = await User.updateStage(senderId, stageToSave, fieldsToSave);

      // Update qualification status
      if (data.qualified !== null && data.qualified !== undefined) {
        updatedUser = await User.updateQualification(senderId, data.qualified);
      }

      // #region agent log
      fetch('http://127.0.0.1:7552/ingest/306b3583-99eb-4cb6-bd0c-3a790ee371e0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f6cbd9'},body:JSON.stringify({sessionId:'f6cbd9',location:'messageProcessor.js:afterDbSave',message:'User row after DB write',data:{userAfter:{stage:updatedUser?.qualification_stage,country:updatedUser?.country,desired_roles:updatedUser?.desired_roles,experience_years:updatedUser?.experience_years,application_status:updatedUser?.application_status,pain_points:updatedUser?.pain_points,qualified:updatedUser?.qualified}},timestamp:Date.now(),hypothesisId:'H3-H5'})}).catch(()=>{});
      // #endregion
    } else {
      // #region agent log
      fetch('http://127.0.0.1:7552/ingest/306b3583-99eb-4cb6-bd0c-3a790ee371e0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f6cbd9'},body:JSON.stringify({sessionId:'f6cbd9',location:'messageProcessor.js:noExtractedData',message:'No extracted_data - users table NOT updated',data:{qualification_stage:claudeResponse.qualification_stage||null,next_action:claudeResponse.next_action||null},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
      // #endregion
    }

    // Step 7: Save Emma's response to database
    await Conversation.saveMessage(senderId, 'assistant', claudeResponse.response);
    console.log(`Saved assistant response to database`);

    // Step 7: Send response via Instagram API
    // Step 7: Split and send response with delays
    const messages = claudeResponse.response.split('|||').map(m => m.trim()).filter(m => m.length > 0);

    console.log(`[SPLIT] Sending ${messages.length} messages with delays`);

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
  
      // Send message
      await sendMessage(senderId, msg);
      console.log(`[SPLIT] Sent message ${i + 1}/${messages.length}: "${msg.substring(0, 40)}..."`);
  
      // Save each part to database
      if (i > 0) {
        await Conversation.saveMessage(senderId, 'assistant', msg);
      }
  
      // Wait 3 seconds before next message (except last one)
      if (i < messages.length - 1) {
        console.log(`[SPLIT] Waiting 3s before next message...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
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

module.exports = { processMessage, queueMessage };
