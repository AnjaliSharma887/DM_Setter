require('dotenv').config();
const readline = require('readline');
const { generateResponse } = require('../services/claude');

function createPrompt() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (question) =>
    new Promise((resolve) => rl.question(question, resolve));

  return { rl, ask };
}

function mergeProfile(profile, extracted, stage) {
  if (!extracted) return profile;

  const updated = { ...profile };

  if (stage) updated.qualification_stage = stage;
  if (extracted.country) updated.country = extracted.country;
  if (extracted.roles) updated.desired_roles = extracted.roles;
  if (extracted.experience_years) {
    const years = parseInt(extracted.experience_years, 10);
    updated.experience_years = Number.isNaN(years) ? extracted.experience_years : years;
  }
  if (extracted.application_status) updated.application_status = extracted.application_status;
  if (extracted.pain_points) updated.pain_points = extracted.pain_points;
  if (extracted.qualified !== null && extracted.qualified !== undefined) {
    updated.qualified = extracted.qualified;
  }

  return updated;
}

function printStatus(profile) {
  console.log('\n--- Current profile ---');
  console.log('Stage:', profile.qualification_stage || 1);
  console.log('Country:', profile.country || 'unknown');
  console.log('Roles:', profile.desired_roles || 'unknown');
  console.log('Experience:', profile.experience_years ?? 'unknown');
  console.log('Application status:', profile.application_status || 'unknown');
  console.log('Pain points:', profile.pain_points || 'unknown');
  console.log('Qualified:', profile.qualified ?? 'unknown');
  console.log('-----------------------\n');
}

async function chat() {
  console.log('Emma Chat — interactive test');
  console.log("Type your message and press Enter.");
  console.log("Commands: 'exit' or 'quit' to end, '/reset' to start over, '/status' to show profile.\n");

  const { rl, ask } = createPrompt();
  const history = [];
  let profile = { qualification_stage: 1 };

  try {
    while (true) {
      const input = (await ask('You: ')).trim();
      if (!input) continue;

      const lower = input.toLowerCase();

      if (lower === 'exit' || lower === 'quit') {
        console.log('\nGoodbye!');
        break;
      }

      if (lower === '/reset') {
        history.length = 0;
        profile = { qualification_stage: 1 };
        console.log('\nConversation reset.\n');
        continue;
      }

      if (lower === '/status') {
        printStatus(profile);
        continue;
      }

      history.push({ sender: 'user', message: input });

      try {
        const response = await generateResponse(history, profile);

        history.push({ sender: 'assistant', message: response.response });
        profile = mergeProfile(profile, response.extracted_data, response.qualification_stage);

        console.log(`\nEmma: ${response.response}\n`);

        if (response.next_action === 'disqualify' || response.next_action === 'end_conversation') {
          console.log('(Conversation ended. Type /reset to start again or exit to quit.)\n');
        }
      } catch (error) {
        history.pop();
        console.error('\nError:', error.message, '\n');
      }
    }
  } finally {
    rl.close();
  }
}

chat().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
