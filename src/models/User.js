const db = require('../config/database');

class User {
  static async findOrCreate(userId, instagramHandle) {
    try {
      // Check if user exists
      const result = await db.query('SELECT * FROM users WHERE user_id = $1', [userId]);
      
      if (result.rows.length > 0) {
        return result.rows[0];
      }
      
      // Create new user
      const newUser = await db.query(
        `INSERT INTO users (user_id, instagram_handle, qualification_stage, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         RETURNING *`,
        [userId, instagramHandle, 1]
      );
      
      return newUser.rows[0];
    } catch (error) {
      console.error('Error in User.findOrCreate:', error);
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
      console.error('Error in User.updateStage:', error);
      throw error;
    }
  }

  static async getById(userId) {
    try {
      const result = await db.query('SELECT * FROM users WHERE user_id = $1', [userId]);
      return result.rows[0];
    } catch (error) {
      console.error('Error in User.getById:', error);
      throw error;
    }
  }
}

module.exports = User;
