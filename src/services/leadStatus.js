const db = require('../config/database');

/**
 * Calculate lead_status for every user ON READ (not stored).
 *
 * Priority order (first match wins):
 *   1. Hot          - qualified AND booked the call (stage 8)
 *   2. Disqualified - failed one/both criteria (qualified = false)
 *   3. Cold         - went silent after a follow-up was sent
 *   4. Qualified    - passed criteria, still engaged, not yet booked
 *   5. In Progress  - everything else (mid conversation)
 *
 * "Went silent after follow-up" =
 *   a follow-up was sent (follow_up_sent_at IS NOT NULL)
 *   AND the user's last message is at/before that follow-up
 *   (last_message_at <= follow_up_sent_at => they didn't reply to it).
 *
 * Uses follow_up_sent_at (timestamp), not follow_up_count, so it works
 * unchanged whether you send 1 or 2 follow-ups.
 */
async function getUsersWithLeadStatus() {
  try {
    const result = await db.query(`
      SELECT
        user_id,
        name,
        email,
        country,
        desired_roles,
        experience_years,
        qualification_stage,
        qualified,
        booking_status,
        follow_up_count,
        follow_up_sent_at,
        last_message_at,
        CASE
          WHEN qualified = true AND qualification_stage = 8
            THEN 'Hot'
          WHEN qualified = false
            THEN 'Disqualified'
          WHEN follow_up_sent_at IS NOT NULL
               AND last_message_at <= follow_up_sent_at
            THEN 'Cold'
          WHEN qualified = true AND qualification_stage < 8
            THEN 'Qualified'
          ELSE 'In Progress'
        END AS lead_status
      FROM users
      ORDER BY last_message_at DESC NULLS LAST
    `);
    return result.rows;
  } catch (error) {
    console.error('[LEAD STATUS] getUsersWithLeadStatus error:', error);
    return [];
  }
}

/**
 * Same calculation, but for a single user.
 * Returns the user row with a lead_status field, or null if not found.
 */
async function getLeadStatusForUser(userId) {
  try {
    const result = await db.query(`
      SELECT
        user_id,
        qualified,
        qualification_stage,
        booking_status,
        follow_up_sent_at,
        last_message_at,
        CASE
          WHEN qualified = true AND qualification_stage = 8
            THEN 'Hot'
          WHEN qualified = false
            THEN 'Disqualified'
          WHEN follow_up_sent_at IS NOT NULL
               AND last_message_at <= follow_up_sent_at
            THEN 'Cold'
          WHEN qualified = true AND qualification_stage < 8
            THEN 'Qualified'
          ELSE 'In Progress'
        END AS lead_status
      FROM users
      WHERE user_id = $1
    `, [userId]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('[LEAD STATUS] getLeadStatusForUser error:', error);
    return null;
  }
}

/**
 * Count of users in each lead_status bucket.
 * Handy for a dashboard summary (Hot: 12, Cold: 30, etc.)
 */
async function getLeadStatusCounts() {
  try {
    const result = await db.query(`
      SELECT lead_status, COUNT(*)::int AS count
      FROM (
        SELECT
          CASE
            WHEN qualified = true AND qualification_stage = 8
              THEN 'Hot'
            WHEN qualified = false
              THEN 'Disqualified'
            WHEN follow_up_sent_at IS NOT NULL
                 AND last_message_at <= follow_up_sent_at
              THEN 'Cold'
            WHEN qualified = true AND qualification_stage < 8
              THEN 'Qualified'
            ELSE 'In Progress'
          END AS lead_status
        FROM users
      ) sub
      GROUP BY lead_status
      ORDER BY count DESC
    `);
    return result.rows;
  } catch (error) {
    console.error('[LEAD STATUS] getLeadStatusCounts error:', error);
    return [];
  }
}

module.exports = {
  getUsersWithLeadStatus,
  getLeadStatusForUser,
  getLeadStatusCounts
};
