const db = require('../config/database');

class User {
  static async findOrCreate(userId) {
    try {
      const result = await db.query('SELECT * FROM users WHERE user_id = $1', [userId]);

      if (result.rows.length > 0) {
        return result.rows[0];
      }

      const newUser = await db.query(
        `INSERT INTO users (user_id, qualification_stage, created_at, updated_at, last_message_at)
         VALUES ($1, 1, NOW(), NOW(), NOW())
         RETURNING *`,
        [userId]
      );

      return newUser.rows[0];
    } catch (error) {
      console.error('User.findOrCreate error:', error);
      throw error;
    }
  }

  static async updateStage(userId, stage, data = {}) {
    try {
      const { country, roles, experience, applicationStatus, painPoints } = data;

      const result = await db.query(
        `UPDATE users
         SET qualification_stage = $1,
             country = COALESCE($2, country),
             desired_roles = COALESCE($3, desired_roles),
             experience_years = COALESCE($4, experience_years),
             application_status = COALESCE($5, application_status),
             pain_points = COALESCE($6, pain_points),
             updated_at = NOW()
         WHERE user_id = $7
         RETURNING *`,
        [stage, country, roles, experience, applicationStatus, painPoints, userId]
      );

      return result.rows[0];
    } catch (error) {
      console.error('User.updateStage error:', error);
      throw error;
    }
  }

  static async updateQualification(userId, qualified) {
    try {
      const result = await db.query(
        `UPDATE users SET qualified = $1, updated_at = NOW() WHERE user_id = $2 RETURNING *`,
        [qualified, userId]
      );
      return result.rows[0];
    } catch (error) {
      console.error('User.updateQualification error:', error);
      throw error;
    }
  }

  static async updateLastMessage(userId) {
    try {
      await db.query(
        `UPDATE users SET last_message_at = NOW(), updated_at = NOW() WHERE user_id = $1`,
        [userId]
      );
    } catch (error) {
      console.error('User.updateLastMessage error:', error);
      throw error;
    }
  }

  static async getById(userId) {
    try {
      const result = await db.query('SELECT * FROM users WHERE user_id = $1', [userId]);
      return result.rows[0];
    } catch (error) {
      console.error('User.getById error:', error);
      throw error;
    }
  }
}

module.exports = User;
