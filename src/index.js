
// Load environment variables
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { processMessage } = require('./services/messageProcessor');
const { initializeDatabase } = require('./config/database');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Health check
app.get('/health', (req, res) => {
  console.log('Health check received');
  res.json({ status: 'ok', timestamp: new Date() });
});

// Webhook verification (Instagram requires this)
app.get('/webhook/instagram', (req, res) => {
  const verifyToken = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const mode = req.query['hub.mode'];

  console.log(`Webhook verification: mode=${mode}, token=${verifyToken}`);

  if (mode === 'subscribe' && verifyToken === process.env.INSTAGRAM_VERIFY_TOKEN) {
    console.log('Expected token:', process.env.INSTAGRAM_VERIFY_TOKEN);
    console.log('Received token:', verifyToken);
    console.log('Webhook verified successfully');
    res.status(200).send(challenge);
  } else {
    console.log('Webhook verification failed');
    res.sendStatus(403);
  }
});

// Webhook receiver (incoming Instagram DMs)
app.post('/webhook/instagram', async (req, res) => {
  try {
    console.log(`Webhook received: ${JSON.stringify(req.body).substring(0, 200)}`);

    // Send 200 immediately (Instagram requires fast response)
    res.sendStatus(200);

    const { entry } = req.body;

    if (!entry || entry.length === 0) {
      console.log('No entry data');
      return;
    }

    // Process each entry
    for (const entryItem of entry) {
      const { messaging } = entryItem;

      if (!messaging) continue;

      for (const event of messaging) {
        // Skip echo messages (messages sent BY us)
        if (event.message && event.message.is_echo) {
          console.log('Skipping echo message');
          continue;
        }

        // Skip if no text message
        if (!event.message || !event.message.text) {
          console.log('No text in message, skipping');
          continue;
        }

        const senderId = event.sender.id;
        const messageText = event.message.text;
        const messageId = event.message.mid;

        console.log(`DM from ${senderId}: "${messageText}"`);

        // Process message asynchronously
        processMessage(senderId, messageText, messageId)
          .then(() => console.log(`Message processed for ${senderId}`))
          .catch(err => console.error(`Error processing for ${senderId}:`, err));
      }
    }

  } catch (error) {
    console.error('Webhook error:', error);
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: err.message });
});

// Start server
async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    console.log('Database initialized');

    // Start listening
    app.listen(PORT, () => {
      console.log(`Server started on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV}`);
      console.log(`Webhook: POST /webhook/instagram`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

