require('dotenv').config();
const { runFollowUpJob, findEligibleUsers } = require('../services/followUp');

async function test() {
  console.log('Testing follow-up job...\n');
  
  const users = await findEligibleUsers();
  console.log(`Found ${users.length} eligible users:`);
  console.log(JSON.stringify(users, null, 2));
  
  if (users.length > 0) {
    console.log('\nRunning follow-up job...');
    await runFollowUpJob();
  }
  
  process.exit(0);
}

test();