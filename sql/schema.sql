-- Users table
CREATE TABLE users (
  user_id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(20),
  instagram_handle VARCHAR(255),
  country VARCHAR(100),
  desired_roles TEXT,
  experience_years INTEGER,
  application_status VARCHAR(100),
  pain_points TEXT,
  qualification_stage INTEGER DEFAULT 1,
  qualified BOOLEAN,
  disqualified_reason TEXT,
  booking_status VARCHAR(100),
  booking_time TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_message_at TIMESTAMP
);

-- Conversations table
CREATE TABLE conversations (
  conversation_id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES users(user_id),
  sender VARCHAR(50),
  message TEXT,
  message_type VARCHAR(50),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  meta_message_id VARCHAR(255),
  processed BOOLEAN DEFAULT FALSE
);

ALTER TABLE conversations ADD COLUMN next_action VARCHAR(50);
ALTER TABLE conversations ADD COLUMN qualification_stage INT;


-- Qualifications log
CREATE TABLE qualifications_log (
  log_id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES users(user_id),
  question_number INTEGER,
  answer_provided TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT
);

-- Follow-ups table (for Week 5)
CREATE TABLE follow_ups (
  follow_up_id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES users(user_id),
  follow_up_number INTEGER,
  sent_at TIMESTAMP,
  response_received BOOLEAN DEFAULT FALSE
);

-- Create indexes for faster queries
CREATE INDEX idx_user_last_message ON users(last_message_at);
CREATE INDEX idx_conversation_user ON conversations(user_id);
CREATE INDEX idx_conversation_timestamp ON conversations(timestamp);

