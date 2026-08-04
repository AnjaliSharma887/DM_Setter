const axios = require('axios');

// Send message via Instagram API
async function sendMessage(recipientId, messageText) {
  try {
    const pageId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;

    const response = await axios.post(
      `https://graph.instagram.com/v26.0/${pageId}/messages`,
      {
        recipient: { id: recipientId },
        messaging_type: 'RESPONSE',
        message: { text: messageText }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`Message sent to ${recipientId}: "${messageText.substring(0, 50)}..."`);
    return response.data;

  } catch (error) {
    console.error('Instagram send error:', error.response?.data || error.message);
    throw error;
  }
}

module.exports = { sendMessage };
