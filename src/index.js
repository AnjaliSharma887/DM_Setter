// Load environment variables
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Logger utility
const logFile = path.join(__dirname, '../logs/app.log');
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  fs.appendFileSync(logFile, logMessage + '\n');
}

// Health check endpoint
app.get('/health', (req, res) => {
  log('Health check received');
  res.json({ status: 'ok', timestamp: new Date() });
});

// Webhook endpoint for Instagram
app.post('/webhook/instagram', (req, res) => {
  try {
    log(`Webhook received: ${JSON.stringify(req.body)}`);

    // Extract data from Instagram webhook
    const { entry } = req.body;
    
    if (!entry || entry.length === 0) {
      log('No entry data in webhook');
      return res.sendStatus(200);
    }

    // Process each entry
    entry.forEach(entryItem => {
      const { messaging } = entryItem;
      
      if (messaging) {
        messaging.forEach(message => {
          const {
            sender: { id: senderId },
            message: { text: messageText },
            timestamp
          } = message;

          log(`Message from ${senderId}: "${messageText}"`);
          
          // TODO: Add ProcessMessage() logic here in Week 2
          // For now, just log it
        });
      }
    });

    // Send acknowledgment to Instagram
    res.sendStatus(200);
  } catch (error) {
    log(`Error processing webhook: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Webhook verification (Instagram requires this)
app.get('/webhook/instagram', (req, res) => {
  const verifyToken = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const mode = req.query['hub.mode'];

  log(`Webhook verification attempt: mode=${mode}, token=${verifyToken}`);

  if (mode === 'subscribe' && verifyToken === process.env.INSTAGRAM_VERIFY_TOKEN) {
    log('Webhook verified successfully');
    res.status(200).send(challenge);
  } else {
    log('Webhook verification failed');
    res.sendStatus(403);
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  log(`Error: ${err.message}`);
  res.status(500).json({ error: err.message });
});

// Start server
app.listen(PORT, () => {
  log(`Server started on port ${PORT}`);
  log(`Environment: ${process.env.NODE_ENV}`);
  log(`Ready to receive webhooks at POST /webhook/instagram`);
});
