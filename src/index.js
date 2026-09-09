
// Load environment variables
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { processMessage, queueMessage } = require('./services/messageProcessor');
const { initializeDatabase } = require('./config/database');
const { sendEscalationAlert } = require('./services/alerting');
const { runFollowUpJob } = require('./services/followUp');
const { getUsersWithLeadStatus, getLeadStatusCounts } = require('./services/leadStatus');
const db = require('./config/database');
const cookieParser = require('cookie-parser');
const dashboardRouter = require('./dashboard');
const TEST_MODE = process.env.TEST_MODE === 'true';

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;
app.use(cookieParser());
app.use(dashboardRouter);
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
    console.log('[FULL WEBHOOK]', JSON.stringify(req.body));

    res.sendStatus(200);

    const { entry } = req.body;

    if (!entry || entry.length === 0) {
      console.log('No entry data');
      return;
    }

    // Process each entry
    for (const entryItem of entry) {
      const { messaging, changes } = entryItem;

      if (messaging) {
        for (const event of messaging) {
          try {

          // Handle postback (button clicks)
            if (event.postback) {
              const senderId = event.sender.id;
              const postbackTitle = event.postback.title;

              if (postbackTitle === 'Sounds Good') {
                // User clicked the "Sounds Good?" button
                const user = await User.findOrCreate(senderId);
                await db.query(
                  `UPDATE users SET came_from_comment = true, automation_enabled = true WHERE user_id = $1`,
                  [senderId]
                );
                console.log(`[MANYCHAT HANDOFF] User ${senderId} clicked button, automation enabled`);
                // Emma takes over from here
                continue;
              }
              // ... other postback handling
            }

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

            // Check if this user came from comment flow
            const userCheck = await db.query(
              `SELECT came_from_comment FROM users WHERE user_id = $1`,
              [senderId]
            );

            const fromComment = userCheck.rows.length > 0 && userCheck.rows[0].came_from_comment;

            if (!fromComment) {
              console.log(`[SKIP] DM from ${senderId} (not from comment flow)`);
              continue;
            }

            const messageText = event.message.text;
            const messageId = event.message.mid;

            console.log(`[COMMENT FLOW] From ${senderId}: "${messageText}"`);

            queueMessage(senderId, messageText, messageId);

          } catch (eventError) {
            console.error('Error processing event:', eventError);
            await sendEscalationAlert(
              eventError,
              `Webhook event error - User: ${event.sender?.id}, Message: "${event.message?.text?.substring(0, 50)}..."`
            );
          }
        }
      }

      if (changes) {
        for (const event of changes) {
        if (event.field === 'comments') {
          const comment = event.value;
      
          // Only REELS
          if (comment.media.media_product_type !== 'REELS') {
            console.log(`Skipping non-REEL comment`);
            continue;
          }
      
          const senderId = comment.from.id;
          const instagram_handle = comment.from.username;
          const mediaId = comment.media.id;
          const commentText = comment.text;

          // Check if the comment is "Help" and on the specific carousel post
          if (mediaId === '18019896590872740' && commentText.toLowerCase() === 'help') {
            console.log(`[MANYCHAT TRIGGER] "Help" comment on post ${mediaId}`);
          const existingUser = await db.query(
          `SELECT reel_id FROM users WHERE user_id = $1`,
          [senderId]
          );

          if (existingUser.rows.length === 0) {
            // New user from comment
            await db.query(
              `INSERT INTO users (user_id, instagram_handle, came_from_comment, reel_id, qualification_stage, automation_enabled)
              VALUES ($1, $2, true, $3, 1, true)`,
              [senderId, instagram_handle, mediaId]
            );
            console.log(`[NEW COMMENT LEAD] User ${senderId} from REEL ${mediaId}`);
          } else {
          // User already exists
            const { reel_id } = existingUser.rows[0];

          if (reel_id !== mediaId) {
      // Commented on a DIFFERENT reel - update reel_id but DON'T reset stage
      await db.query(
        `UPDATE users SET reel_id = $1 WHERE user_id = $2`,
        [mediaId, senderId]
      );
      console.log(`[MULTI-REEL] User ${senderId} also commented on REEL ${mediaId} (was on ${reel_id})`);
    } else {
      // Same reel - ignore
      console.log(`[DUPLICATE] User ${senderId} already commented on this reel`);
    }
  }
} else {
  console.log(`[SKIP] Comment "${commentText}" on REEL ${mediaId} does not match the trigger criteria`);
 }
          }
        }
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
      
      // ← MOVED INSIDE app.listen callback
      // Start follow-up background job (runs every 15 minutes)
      const FOLLOWUP_INTERVAL = 15 * 60 * 1000;
      
      setInterval(async () => {
        console.log('[SCHEDULER] Running follow-up job...');
        await runFollowUpJob();
      }, FOLLOWUP_INTERVAL);

      // Run once on startup after 30 seconds
      setTimeout(async () => {
        console.log('[SCHEDULER] Initial follow-up job on startup');
        await runFollowUpJob();
      }, 30000);

      console.log(`[SCHEDULER] Follow-up job scheduled to run every 15 minutes`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Get all leads with status
app.get('/analytics/leads', async (req, res) => {
  const leads = await getUsersWithLeadStatus();
  res.json(leads);
});

app.get('/analytics/leads/counts', async (req, res) => {
  const counts = await getLeadStatusCounts();
  res.json(counts);
});

startServer();
