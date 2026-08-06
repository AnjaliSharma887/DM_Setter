const nodemailer = require('nodemailer');

// Gmail setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.ALERT_EMAIL,
    pass: process.env.ALERT_EMAIL_PASSWORD
  }
});

async function sendEscalationAlert(error, context, claudeResponse = null) {
  try {
    let emailBody = `
Emma Escalation Alert
=====================

Error: ${error.message}

Context: ${context}

Time: ${new Date().toISOString()}

Action Required:
1. Check logs at: https://railway.app (astonishing-balance)
2. Fix the issue
3. Redeploy
`;

    // ← ADD THIS: Include Claude's response
    if (claudeResponse) {
      emailBody += `

WHAT CLAUDE GENERATED (what user SHOULD have received):
========================================================
${claudeResponse}

ACTION: You can manually send this message to the user via Instagram, or wait for fix and let system resend.
`;
    }

    emailBody += `

Error Stack:
${error.stack}
    `;

    await transporter.sendMail({
      from: process.env.ALERT_EMAIL,
      to: process.env.ADMIN_EMAIL,
      subject: '🚨 Emma Escalation Alert',
      text: emailBody
    });

    console.log('[ALERT] Email sent to admin');
  } catch (emailError) {
    console.error('[ALERT] Failed to send email:', emailError);
  }
}

// module.exports = { sendEscalationAlert };

async function sendFollowUpNotification(user, followUpMessage, lastMessages) {
  try {
    const emailBody = `
Emma Follow-up Sent
===================

USER DETAILS:
- User ID: ${user.user_id}
- Country: ${user.country || 'Not provided'}
- Roles: ${user.desired_roles || 'Not provided'}
- Experience: ${user.experience_years || 'Not provided'} years
- Qualification Stage: ${user.qualification_stage}
- Qualified: ${user.qualified}
- Last Message At: ${user.last_message_at}

LAST 3 MESSAGES (context):
${lastMessages.map((m, i) => `${i + 1}. [${m.sender}]: ${m.message}`).join('\n')}

FOLLOW-UP MESSAGE SENT:
========================
${followUpMessage}

Time Sent: ${new Date().toISOString()}

---
This is an automated notification. No action required.
    `;

    await transporter.sendMail({
      from: process.env.ALERT_EMAIL,
      to: process.env.ADMIN_EMAIL,
      subject: `📩 Follow-up sent to ${user.user_id}`,
      text: emailBody
    });

    console.log('[FOLLOWUP ALERT] Email sent');
  } catch (emailError) {
    console.error('[FOLLOWUP ALERT] Failed to send email:', emailError);
  }
}

module.exports = { sendEscalationAlert, sendFollowUpNotification };
