// ============================================
// STANDALONE EMAIL TEST
// Run with: node src/test/testEmail.js
// ============================================
require('dotenv').config();
const nodemailer = require('nodemailer');

async function testEmail() {
  console.log('\n=== EMAIL TEST STARTING ===\n');

  // Step 1: Check env variables are loaded
  console.log('1. Checking environment variables:');
  console.log('   ALERT_EMAIL:', process.env.ALERT_EMAIL || '❌ MISSING');
  console.log('   ALERT_EMAIL_PASSWORD:', process.env.ALERT_EMAIL_PASSWORD ? '✅ Set (' + process.env.ALERT_EMAIL_PASSWORD.length + ' chars)' : '❌ MISSING');
  console.log('   ADMIN_EMAIL:', process.env.ADMIN_EMAIL || '❌ MISSING');
  console.log('');

  if (!process.env.ALERT_EMAIL || !process.env.ALERT_EMAIL_PASSWORD || !process.env.ADMIN_EMAIL) {
    console.log('❌ STOP: One or more email env variables are missing.');
    console.log('   Add them to .env (local) or Railway Variables.\n');
    return;
  }

  // Step 2: Create transporter (same config as alerting.js)
  console.log('2. Creating transporter (smtp.gmail.com:587, IPv4)...');
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    family: 4,          // force IPv4
    auth: {
      user: process.env.ALERT_EMAIL,
      pass: process.env.ALERT_EMAIL_PASSWORD
    },
    tls: {
      rejectUnauthorized: false
    }
  });
  console.log('   ✅ Transporter created\n');

  // Step 3: Verify connection to Gmail
  console.log('3. Verifying connection to Gmail SMTP...');
  try {
    await transporter.verify();
    console.log('   ✅ Connection verified! Gmail accepted the credentials.\n');
  } catch (verifyError) {
    console.log('   ❌ VERIFY FAILED:');
    console.log('   ', verifyError.message);
    console.log('');
    console.log('   Common causes:');
    console.log('   - Wrong app password (must be a 16-char Gmail APP password, not your normal password)');
    console.log('   - 2-Step Verification not enabled on the Gmail account');
    console.log('   - "Less secure apps" — use App Password instead');
    console.log('');
    return; // stop here, no point trying to send
  }

  // Step 4: Send the actual test email
  console.log('4. Sending test email...');
  try {
    const info = await transporter.sendMail({
      from: process.env.ALERT_EMAIL,
      to: process.env.ADMIN_EMAIL,
      subject: '✅ Emma Email Test - ' + new Date().toLocaleTimeString(),
      text: `This is a test email from your Emma app.\n\nIf you're reading this, email sending works!\n\nSent at: ${new Date().toISOString()}`
    });

    console.log('   ✅ EMAIL SENT SUCCESSFULLY!');
    console.log('   Message ID:', info.messageId);
    console.log('   Accepted:', info.accepted);
    console.log('   Rejected:', info.rejected);
    console.log('');
    console.log('   👉 Check the inbox of:', process.env.ADMIN_EMAIL);
    console.log('   (Also check SPAM folder!)\n');

  } catch (sendError) {
    console.log('   ❌ SEND FAILED:');
    console.log('   ', sendError.message);
    console.log('');
    console.log('   Full error:', sendError);
  }

  console.log('=== EMAIL TEST COMPLETE ===\n');
}

testEmail().catch(err => {
  console.error('Unexpected error:', err);
});
