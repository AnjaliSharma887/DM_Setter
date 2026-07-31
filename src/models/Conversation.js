const db = require('../config/database');

class Conversation {
  static async saveMessage(userId, sender, message, metaMessageId = null) {
    try {
      const result = await db.query(
        `INSERT INTO conversations (user_id, sender, message, message_type, meta_message_id, timestamp)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING *`,
        [userId, sender, message, 'text', metaMessageId]
      );
      
      return result.rows[0];
    } catch (error) {
      console.error('Error in Conversation.saveMessage:', error);
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
