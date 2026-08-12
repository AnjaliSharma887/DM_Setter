const express = require('express');
const router = express.Router();
const { getDashboardData } = require('./services/analytics');

/**
 * Simple password gate via query param or cookie.
 * Set DASHBOARD_PASSWORD in Railway env.
 *
 * Access: https://your-app.up.railway.app/dashboard?key=YOUR_PASSWORD
 * Once correct, a cookie keeps them logged in so they don't retype it.
 */
function checkAuth(req, res, next) {
  const password = process.env.DASHBOARD_PASSWORD;

  // If no password is configured, refuse rather than expose data
  if (!password) {
    return res.status(500).send('Dashboard password not configured.');
  }

  const provided = req.query.key || req.cookies?.dash_key;

  if (provided === password) {
    // Set cookie so future requests (and the data fetch) stay authed
    res.cookie('dash_key', password, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: 'lax'
    });
    return next();
  }

  // Wrong or missing key -> show a minimal login prompt
  return res.status(401).send(loginPage());
}

/**
 * The data endpoint the page fetches from. Also password-gated.
 */
router.get('/dashboard/data', checkAuth, async (req, res) => {
  try {
    const data = await getDashboardData();
    res.json(data);
  } catch (error) {
    console.error('[DASHBOARD] data error:', error);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

/**
 * The dashboard page itself.
 */
router.get('/dashboard', checkAuth, (req, res) => {
  res.send(dashboardPage());
});

// ============ HTML ============

function loginPage() {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Emma Dashboard</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f7f7f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .box { background: #fff; padding: 2rem; border-radius: 14px; border: 1px solid #eee; width: 320px; text-align: center; }
  h1 { font-size: 18px; font-weight: 600; margin: 0 0 4px; }
  p { color: #888; font-size: 13px; margin: 0 0 20px; }
  input { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; margin-bottom: 12px; }
  button { width: 100%; padding: 10px; background: #185FA5; color: #fff; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; }
</style></head>
<body>
  <div class="box">
    <h1>Emma Dashboard</h1>
    <p>Enter your access password</p>
    <input type="password" id="pw" placeholder="Password" onkeydown="if(event.key==='Enter')go()" />
    <button onclick="go()">View dashboard</button>
  </div>
  <script>
    function go() {
      const pw = document.getElementById('pw').value;
      window.location.href = '/dashboard?key=' + encodeURIComponent(pw);
    }
  </script>
</body></html>`;
}

function dashboardPage() {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Emma — Lead Dashboard</title>
<style>
  :root { --blue:#185FA5; --blue2:#378ADD; --blue3:#85B7EB; --blue4:#B5D4F4;
    --teal:#1D9E75; --amber:#EF9F27; --gray:#888780; --red:#E24B4A;
    --purple:#534AB7; --coral:#D85A30; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #f7f7f5; color: #1a1a18; margin: 0; padding: 24px; }
  .wrap { max-width: 920px; margin: 0 auto; }
  .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 8px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand .logo { width: 36px; height: 36px; border-radius: 9px; background: #E6F1FB; display: flex; align-items: center; justify-content: center; font-size: 20px; }
  .brand h1 { font-size: 17px; font-weight: 600; margin: 0; }
  .brand p { font-size: 12px; color: #999; margin: 0; }
  .refresh { font-size: 12px; color: #666; background: #fff; border: 1px solid #e5e5e5; padding: 6px 12px; border-radius: 8px; cursor: pointer; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px,1fr)); gap: 12px; margin-bottom: 14px; }
  .card { background: #fff; border-radius: 10px; padding: 15px 16px; border: 1px solid #eee; }
  .card .label { font-size: 13px; color: #777; margin: 0 0 4px; }
  .card .num { font-size: 26px; font-weight: 600; margin: 0; }
  .card .sub { font-size: 12px; color: #999; margin: 4px 0 0; }
  .card .num small { font-size: 14px; color: #aaa; font-weight: 400; }
  .row { display: grid; grid-template-columns: 1.15fr 1fr; gap: 12px; margin-bottom: 14px; }
  .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .panel { background: #fff; border: 1px solid #eee; border-radius: 12px; padding: 16px 18px; }
  .panel h2 { font-size: 14px; font-weight: 600; margin: 0 0 2px; }
  .panel .desc { font-size: 12px; color: #999; margin: 0 0 14px; }
  .bar-row { margin-bottom: 10px; }
  .bar-top { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px; }
  .bar-top span:last-child { color: #888; }
  .bar-bg { height: 8px; border-radius: 4px; background: #f0f0ee; overflow: hidden; }
  .bar-fill { height: 8px; border-radius: 4px; }
  .funnel-bar { height: 26px; border-radius: 6px; }
  .legend { display: flex; align-items: center; gap: 8px; font-size: 13px; margin-bottom: 9px; }
  .dot { width: 10px; height: 10px; border-radius: 3px; }
  .legend span.count { margin-left: auto; color: #888; }
  .stack { display: flex; height: 10px; border-radius: 5px; overflow: hidden; margin-top: 12px; }
  .insight { font-size: 12px; color: #555; padding: 8px 10px; border-radius: 6px; margin: 14px 0 0; }
  .insight.warn { background: #FAEEDA; }
  .insight.info { background: #E6F1FB; }
  .empty { font-size: 13px; color: #aaa; padding: 8px 0; }
  .foot { text-align: center; font-size: 11px; color: #bbb; margin-top: 18px; }
  @media (max-width: 640px) { .row, .row2 { grid-template-columns: 1fr; } }
</style></head>
<body>
<div class="wrap">
  <div class="head">
    <div class="brand">
      <div class="logo">🤖</div>
      <div><h1>Emma — lead dashboard</h1><p>Careertegy · Instagram DMs</p></div>
    </div>
    <button class="refresh" onclick="load()">↻ Refresh</button>
  </div>
  <div id="content"><p class="empty">Loading…</p></div>
  <div class="foot" id="foot"></div>
</div>

<script>
function pct(n, d) { return d > 0 ? Math.round((n/d)*100) : 0; }

async function load() {
  document.getElementById('content').innerHTML = '<p class="empty">Loading…</p>';
  try {
    const res = await fetch('/dashboard/data', { credentials: 'same-origin' });
    if (!res.ok) throw new Error('fetch failed');
    const d = await res.json();
    render(d);
  } catch (e) {
    document.getElementById('content').innerHTML = '<p class="empty">Could not load data. Try refreshing.</p>';
  }
}

function render(d) {
  const s = d.summary, h = d.handled;
  const statusColors = { 'Hot':'#185FA5','Qualified':'#1D9E75','In Progress':'#EF9F27','Cold':'#888780','Disqualified':'#E24B4A' };
  const funnelColors = ['#B5D4F4','#85B7EB','#378ADD','#185FA5'];

  // Cards
  let html = '<div class="cards">';
  html += card('Total leads', s.total_leads, '');
  html += card('Qualified', s.qualified + ' <small>/ ' + s.qualified_rate + '%</small>', 'of all leads');
  html += card('Calls booked', s.booked + ' <small>/ ' + s.booking_rate + '%</small>', 'of qualified');
  html += card('Handled by Emma', h.handled_pct + '%', h.escalated_pct + '% escalated to you');
  html += '</div>';

  // Funnel + status
  html += '<div class="row">';
  html += '<div class="panel"><h2>Conversion funnel</h2><p class="desc">Where leads drop off</p>';
  const maxFunnel = d.funnel[0]?.count || 1;
  d.funnel.forEach((f, i) => {
    const w = maxFunnel > 0 ? Math.max(4, Math.round((f.count/maxFunnel)*100)) : 4;
    html += '<div class="bar-row"><div class="bar-top"><span>'+f.label+'</span><span>'+f.count+' · '+f.pct+'%</span></div>';
    html += '<div class="funnel-bar" style="width:'+w+'%;background:'+funnelColors[i]+';"></div></div>';
  });
  html += '</div>';

  html += '<div class="panel"><h2>Lead status</h2><p class="desc">Current breakdown</p>';
  const totalStatus = d.lead_status.reduce((a,b)=>a+b.count,0) || 1;
  d.lead_status.forEach(ls => {
    html += '<div class="legend"><span class="dot" style="background:'+(statusColors[ls.status]||'#ccc')+';"></span>'+ls.status+'<span class="count">'+ls.count+'</span></div>';
  });
  html += '<div class="stack">';
  d.lead_status.forEach(ls => {
    const w = pct(ls.count, totalStatus);
    if (w > 0) html += '<div style="width:'+w+'%;background:'+(statusColors[ls.status]||'#ccc')+';"></div>';
  });
  html += '</div></div></div>';

  // Disqualification + pain points
  html += '<div class="row2">';

  html += '<div class="panel"><h2>Why leads get disqualified</h2><p class="desc">Fixes your ad targeting</p>';
  if (d.disqualification_reasons.length === 0) {
    html += '<p class="empty">No disqualifications yet.</p>';
  } else {
    const maxDq = Math.max(...d.disqualification_reasons.map(r=>r.count));
    const dqColors = ['#D85A30','#EF9F27','#888780'];
    d.disqualification_reasons.forEach((r,i) => {
      const w = maxDq>0 ? Math.round((r.count/maxDq)*100) : 0;
      html += barRow(r.reason, r.count, w, dqColors[i % dqColors.length]);
    });
    // Insight
    const top = d.disqualification_reasons[0];
    const totalDq = d.disqualification_reasons.reduce((a,b)=>a+b.count,0);
    const topPct = pct(top.count, totalDq);
    if (top.reason === 'Wrong country' && topPct >= 40) {
      html += '<p class="insight warn">💡 '+topPct+'% fail on country — tighten ad geo-targeting.</p>';
    } else if (top.reason === 'Too senior' && topPct >= 40) {
      html += '<p class="insight warn">💡 '+topPct+'% too senior — your ads may be reaching mid-career people, not students.</p>';
    }
  }
  html += '</div>';

  html += '<div class="panel"><h2>Top pain points</h2><p class="desc">Among qualified leads</p>';
  if (d.pain_points.length === 0) {
    html += '<p class="empty">No pain point data yet.</p>';
  } else {
    const maxPp = Math.max(...d.pain_points.map(r=>r.count));
    const ppColors = ['#534AB7','#7F77DD','#AFA9EC','#CECBF6','#CECBF6','#CECBF6','#CECBF6','#CECBF6'];
    d.pain_points.forEach((r,i) => {
      const w = maxPp>0 ? Math.round((r.count/maxPp)*100) : 0;
      html += barRow(r.pain_point, r.count, w, ppColors[i % ppColors.length]);
    });
    html += '<p class="insight info">💡 '+d.pain_points[0].pain_point+' is the top concern — feature it in your ad creative.</p>';
  }
  html += '</div></div>';

  document.getElementById('content').innerHTML = html;
  const dt = new Date(d.generated_at);
  document.getElementById('foot').textContent = 'Updated ' + dt.toLocaleString();
}

function card(label, num, sub) {
  return '<div class="card"><p class="label">'+label+'</p><p class="num">'+num+'</p><p class="sub">'+sub+'</p></div>';
}
function barRow(label, count, widthPct, color) {
  return '<div class="bar-row"><div class="bar-top"><span>'+label+'</span><span>'+count+'</span></div>'+
    '<div class="bar-bg"><div class="bar-fill" style="width:'+widthPct+'%;background:'+color+';"></div></div></div>';
}

load();
</script>
</body></html>`;
}

module.exports = router;
