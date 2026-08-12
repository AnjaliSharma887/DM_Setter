const db = require('../config/database');

/**
 * All dashboard analytics, calculated on-read from the users table
 * (plus escalations table for the "handled by Emma" metric).
 *
 * Everything here is READ-ONLY. No writes, so it can never corrupt data.
 * Every function fails soft (returns safe defaults) so one broken metric
 * never takes down the whole dashboard.
 */

// ---- helper: run a query, return rows, never throw ----
async function safeQuery(sql, params = []) {
  try {
    const result = await db.query(sql, params);
    return result.rows;
  } catch (error) {
    console.error('[ANALYTICS] query error:', error.message);
    return [];
  }
}

/**
 * Top-line summary numbers (the 4 metric cards).
 */
async function getSummary() {
  const rows = await safeQuery(`
    SELECT
      COUNT(*)::int AS total_leads,
      COUNT(*) FILTER (WHERE qualified = true AND qualification_stage >= 4)::int AS qualified,
      COUNT(*) FILTER (WHERE qualified = false)::int AS disqualified,
      COUNT(*) FILTER (WHERE qualification_stage = 8)::int AS booked
    FROM users
  `);

  const r = rows[0] || { total_leads: 0, qualified: 0, disqualified: 0, booked: 0 };

  // Percentages (guard divide-by-zero)
  const qualifiedRate = r.total_leads > 0 ? Math.round((r.qualified / r.total_leads) * 100) : 0;
  const bookingRate = r.qualified > 0 ? Math.round((r.booked / r.qualified) * 100) : 0;

  return {
    total_leads: r.total_leads,
    qualified: r.qualified,
    qualified_rate: qualifiedRate,
    disqualified: r.disqualified,
    booked: r.booked,
    booking_rate: bookingRate
  };
}

/**
 * Lead status breakdown (Hot / Qualified / In Progress / Cold / Disqualified).
 * Mirrors the same priority logic used in leadStatus.js.
 */
async function getLeadStatusBreakdown() {
  const rows = await safeQuery(`
    SELECT lead_status, COUNT(*)::int AS count
    FROM (
      SELECT
        CASE
          WHEN qualified = true AND qualification_stage = 8 THEN 'Hot'
          WHEN qualified = false THEN 'Disqualified'
          WHEN follow_up_sent_at IS NOT NULL
               AND last_message_at <= follow_up_sent_at THEN 'Cold'
          WHEN qualified = true AND qualification_stage >= 4 THEN 'Qualified'
          ELSE 'In Progress'
        END AS lead_status
      FROM users
    ) sub
    GROUP BY lead_status
  `);

  // Normalise into a fixed shape so the frontend always gets all 5 buckets
  const order = ['Hot', 'Qualified', 'In Progress', 'Cold', 'Disqualified'];
  const map = {};
  rows.forEach(r => { map[r.lead_status] = r.count; });

  return order.map(status => ({ status, count: map[status] || 0 }));
}

/**
 * Conversion funnel: total -> qualified -> booked -> hot.
 */
async function getFunnel() {
  const rows = await safeQuery(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE qualified = true AND qualification_stage >= 4)::int AS qualified,
      COUNT(*) FILTER (WHERE qualification_stage = 8)::int AS booked,
      COUNT(*) FILTER (WHERE qualified = true AND qualification_stage = 8)::int AS hot
    FROM users
  `);

  const r = rows[0] || { total: 0, qualified: 0, booked: 0, hot: 0 };
  const pct = (n) => r.total > 0 ? Math.round((n / r.total) * 100) : 0;

  return [
    { label: 'Total leads', count: r.total, pct: 100 },
    { label: 'Qualified', count: r.qualified, pct: pct(r.qualified) },
    { label: 'Booked call', count: r.booked, pct: pct(r.booked) },
    { label: 'Hot', count: r.hot, pct: pct(r.hot) }
  ];
}

/**
 * Disqualification reasons breakdown (needs disqualified_reason column populated).
 */
async function getDisqualificationReasons() {
  const rows = await safeQuery(`
    SELECT
      COALESCE(disqualified_reason, 'other') AS reason,
      COUNT(*)::int AS count
    FROM users
    WHERE qualified = false
    GROUP BY COALESCE(disqualified_reason, 'other')
    ORDER BY count DESC
  `);

  // Friendly labels
  const labels = {
    country_not_supported: 'Wrong country',
    experience_too_senior: 'Too senior',
    other: 'Other / unclear'
  };

  return rows.map(r => ({
    reason: labels[r.reason] || r.reason,
    count: r.count
  }));
}

/**
 * Top pain points among qualified leads.
 * pain_points is free text, so we return the most common non-empty values.
 */
async function getPainPoints() {
  const rows = await safeQuery(`
    SELECT pain_points, COUNT(*)::int AS count
    FROM users
    WHERE pain_points IS NOT NULL
      AND TRIM(pain_points) <> ''
      AND qualified = true
    GROUP BY pain_points
    ORDER BY count DESC
    LIMIT 8
  `);

  return rows.map(r => ({ pain_point: r.pain_points, count: r.count }));
}

/**
 * "Handled by Emma" vs escalated.
 * Uses the escalations table if it exists; falls back gracefully if not.
 */
async function getHandledStats() {
  const totalRows = await safeQuery(`SELECT COUNT(*)::int AS total FROM users`);
  const total = totalRows[0]?.total || 0;

  // Distinct users who were ever escalated
  const escRows = await safeQuery(`
    SELECT COUNT(DISTINCT user_id)::int AS escalated_users
    FROM escalations
  `);
  const escalated = escRows[0]?.escalated_users || 0;

  const handledPct = total > 0 ? Math.round(((total - escalated) / total) * 100) : 100;
  const escalatedPct = total > 0 ? Math.round((escalated / total) * 100) : 0;

  return { total, escalated, handled_pct: handledPct, escalated_pct: escalatedPct };
}

/**
 * One call that assembles everything the dashboard needs.
 */
async function getDashboardData() {
  const [summary, leadStatus, funnel, disqualReasons, painPoints, handled] =
    await Promise.all([
      getSummary(),
      getLeadStatusBreakdown(),
      getFunnel(),
      getDisqualificationReasons(),
      getPainPoints(),
      getHandledStats()
    ]);

  return {
    summary,
    lead_status: leadStatus,
    funnel,
    disqualification_reasons: disqualReasons,
    pain_points: painPoints,
    handled,
    generated_at: new Date().toISOString()
  };
}

module.exports = {
  getSummary,
  getLeadStatusBreakdown,
  getFunnel,
  getDisqualificationReasons,
  getPainPoints,
  getHandledStats,
  getDashboardData
};
