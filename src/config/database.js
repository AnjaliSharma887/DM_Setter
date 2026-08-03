const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
  log(`Database pool error: ${err.message}`);
});

pool.on('connect', () => {
  log('Database connected');
});

// Initialize database tables
async function initializeDatabase() {
  try {
    log('Initializing database...');
    
    const schemaPath = path.join(__dirname, '../../sql/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    await pool.query(schema);
    log('Database schema created successfully');
  } catch (error) {
    log(`Database initialization error: ${error.message}`);
  }
}

module.exports = {
  pool,
  initializeDatabase,
  query: (text, params) => pool.query(text, params)
};

