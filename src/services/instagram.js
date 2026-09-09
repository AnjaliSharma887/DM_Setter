const axios = require('axios');

// Send message via Instagram API
async function sendMessage(recipientId, messageText) {
  try {
    // ── TEST MODE SAFETY ──
    if (process.env.TEST_MODE === 'true') {
      console.log(`[TEST MODE] Would send to ${recipientId}: "${messageText.substring(0, 50)}..."`);
      return { test_mode: true, skipped: true };
    }
    // ── END TEST MODE ──

    const pageId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;

    // Split message into chunks of 1000 characters
    const chunkSize = 900;
    const chunks = [];
    
    for (let i = 0; i < messageText.length; i += chunkSize) {
      chunks.push(messageText.substring(i, i + chunkSize));
    }

    console.log(`[SEND MESSAGE] Splitting into ${chunks.length} chunk(s) for ${recipientId}`);

    // Send each chunk with a delay
    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index];
      
      const response = await axios.post(
        `https://graph.instagram.com/v26.0/${pageId}/messages`,
        {
          recipient: { id: recipientId },
          messaging_type: 'RESPONSE',
          message: { text: chunk }
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`[CHUNK ${index + 1}/${chunks.length}] Sent to ${recipientId}: "${chunk.substring(0, 50)}..."`);

      // Add 1 second delay between chunks (except after the last one)
      if (index < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return { success: true, chunks: chunks.length };

  } catch (error) {
    console.error('Instagram send error:', error.response?.data || error.message);
    throw error;
  }
}

module.exports = { sendMessage };