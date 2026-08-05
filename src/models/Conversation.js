const db = require('../config/database');

class Conversation {
  static async saveMessage(userId, sender, message, messageId, nextAction = null, stage = null) {
    try {
      const result = await db.query(
        `INSERT INTO conversations (user_id, sender, message, timestamp, meta_message_id, next_action, qualification_stage)
         VALUES ($1, $2, $3, NOW(), $4, $5, $6)
         RETURNING *`,
         [userId, sender, message, messageId, nextAction, stage]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Conversation.saveMessage error:', error);
      throw error;
    }
  }

  static async getHistory(userId, limit = 10) {
    try {
      const result = await db.query(
        `SELECT * FROM conversations 
         WHERE user_id = $1 
         ORDER BY timestamp DESC 
         LIMIT $2`,
        [userId, limit]
      );
      
      return result.rows.reverse(); // Return in chronological order
    } catch (error) {
      console.error('Error in Conversation.getHistory:', error);
      throw error;
    }
  }
}

module.exports = Conversation;
