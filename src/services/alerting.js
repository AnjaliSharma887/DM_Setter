const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

// Using Resend's test sender (no domain verification needed).
// Alerts go to YOU, so this is fine. Swap to your own domain later if you want.
const FROM_ADDRESS = 'Emma Alerts <onboarding@resend.dev>';

/**
 * Internal helper - sends an email via Resend and logs the result.
 * Never throws - email failure should not crash the message flow.
 */
async function sendEmail(subject, body) {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.error('[ALERT] RESEND_API_KEY missing - cannot send email');
      return;
    }
    if (!process.env.ADMIN_EMAIL) {
      console.error('[ALERT] ADMIN_EMAIL missing - cannot send email');
      return;
    }

    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: process.env.ADMIN_EMAIL,
      subject: subject,
      text: body
    });

    if (error) {
      console.error('[ALERT] Resend error:', error);
      return;
    }

    console.log('[ALERT] Email sent, id:', data?.id);
  } catch (err) {
    console.error('[ALERT] Failed to send email:', err.message);
  }
}

/**
 * Escalation alert for ERRORS (used in catch blocks).
 * Keeps the same signature as before.
 */
async function sendEscalationAlert(error, context, claudeResponse = null) {
  let body = `Emma Escalation Alert\n`;
  body += `=====================\n\n`;
  body += `Error: ${error?.message || error}\n`;
  body += `Context: ${context}\n`;

  if (claudeResponse) {
    body += `\nWHAT CLAUDE GENERATED:\n${claudeResponse}\n`;
    body += `\nACTION: You may want to send this message to the user manually.`;
  } else {
    body += `\n⚠️ Claude did not generate a response.`;
  }

  body += `\n\nTime: ${new Date().toISOString()}`;

  await sendEmail('🚨 Emma Escalation Alert', body);
}

/**
 * Notification when a FOLLOW-UP is sent.
 * Keeps the same signature as before.
 */
async function sendFollowUpNotification(user, followUpMessage, lastMessages = []) {
  let body = `Emma Follow-up Sent\n`;
  body += `===================\n\n`;
  body += `USER DETAILS:\n`;
  body += `- User ID: ${user.user_id}\n`;
  body += `- Country: ${user.country || 'Not provided'}\n`;
  body += `- Roles: ${user.desired_roles || 'Not provided'}\n`;
  body += `- Experience: ${user.experience_years || 'Not provided'} years\n`;
  body += `- Qualification Stage: ${user.qualification_stage}\n`;
  body += `- Qualified: ${user.qualified}\n`;
  body += `- Last Message At: ${user.last_message_at}\n\n`;

  if (lastMessages && lastMessages.length > 0) {
    body += `LAST MESSAGES (context):\n`;
    body += lastMessages
      .map((m, i) => `${i + 1}. [${m.sender}]: ${m.message}`)
      .join('\n');
    body += `\n\n`;
  }

  body += `FOLLOW-UP MESSAGE SENT:\n`;
  body += `========================\n`;
  body += `${followUpMessage}\n\n`;
  body += `Time Sent: ${new Date().toISOString()}\n`;
  body += `\n---\nThis is an automated notification. No action required.`;

  await sendEmail(`📩 Follow-up sent to ${user.user_id}`, body);
}

/**
 * Human escalation email (angry / out-of-scope / etc.)
 * Keeps the same signature as before, including the resolve link.
 */
async function sendEscalationEmail(user, userMessage, reason, allMessages = []) {
  const APP_URL = process.env.APP_URL || 'https://dmsetter-production.up.railway.app';

  let body = `🚨 HUMAN ESCALATION REQUIRED\n`;
  body += `==============================\n\n`;
  body += `USER DETAILS:\n`;
  body += `- User ID: ${user.user_id}\n`;
  body += `- Country: ${user.country || 'Not provided'}\n`;
  body += `- Roles: ${user.desired_roles || 'Not provided'}\n`;
  body += `- Experience: ${user.experience_years || 'Not provided'} years\n`;
  body += `- Qualification Stage: ${user.qualification_stage}\n`;
  body += `- Qualified: ${user.qualified || 'Not determined'}\n\n`;
  body += `ESCALATION REASON: ${reason}\n\n`;
  body += `TRIGGER MESSAGE:\n"${userMessage}"\n\n`;

  if (allMessages && allMessages.length > 0) {
    body += `ALL PENDING MESSAGES:\n`;
    body += allMessages
      .map((m, i) => `${i + 1}. [${m.created_at}]: "${m.user_message}"`)
      .join('\n');
    body += `\n\n`;
  }

  body += `Time: ${new Date().toISOString()}\n\n`;
  body += `ACTION REQUIRED:\n`;
  body += `1. Reply to the user manually on Instagram\n`;
  body += `2. Click the link below to resume automation:\n\n`;
  body += `✅ RESOLVE & RESUME AUTOMATION:\n`;
  body += `${APP_URL}/escalation/resolve/${user.user_id}`;

  await sendEmail(`🚨 Escalation [${reason}] - User ${user.user_id}`, body);
}

module.exports = {
  sendEscalationAlert,
  sendFollowUpNotification,
  sendEscalationEmail
};
