export function dashboardHtml(projectName: string, projectSlug: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sinfonia — ${esc(projectName)}</title>
<style>
  :root {
    --bg: #0f1117;
    --surface: #1a1d27;
    --border: #2a2d3a;
    --text: #e1e4ed;
    --text-dim: #8b8fa3;
    --accent: #6c8cff;
    --green: #4ade80;
    --yellow: #facc15;
    --red: #f87171;
    --cyan: #22d3ee;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: var(--bg); color: var(--text); font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', monospace; font-size: 13px; }

  .container { max-width: 1200px; margin: 0 auto; padding: 24px; }

  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; padding-bottom: 16px; border-bottom: 1px solid var(--border); }
  header h1 { font-size: 20px; font-weight: 600; color: var(--cyan); }
  header h1 span { color: var(--text-dim); font-weight: 400; font-size: 14px; margin-left: 12px; }
  .refresh-btn { background: var(--surface); border: 1px solid var(--border); color: var(--accent); padding: 6px 16px; border-radius: 6px; cursor: pointer; font-family: inherit; font-size: 12px; }
  .refresh-btn:hover { background: var(--border); }

  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 32px; }
  .stat { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
  .stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); margin-bottom: 4px; }
  .stat-value { font-size: 22px; font-weight: 700; }
  .stat-value.green { color: var(--green); }
  .stat-value.cyan { color: var(--cyan); }
  .stat-value.yellow { color: var(--yellow); }

  .section { margin-bottom: 32px; }
  .section h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); margin-bottom: 12px; }

  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 8px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); border-bottom: 1px solid var(--border); }
  td { padding: 8px 12px; border-bottom: 1px solid var(--border); font-size: 13px; white-space: nowrap; }
  tr:hover td { background: var(--surface); }

  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .badge-todo { background: rgba(34,211,238,0.15); color: var(--cyan); }
  .badge-progress { background: rgba(74,222,128,0.15); color: var(--green); }
  .badge-rework { background: rgba(250,204,21,0.15); color: var(--yellow); }

  .toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; margin-bottom: 6px; }
  .toggle-name { font-weight: 500; }
  .toggle-on { color: var(--green); font-size: 11px; font-weight: 600; }
  .toggle-off { color: var(--text-dim); font-size: 11px; font-weight: 600; }

  .event { color: var(--text-dim); max-width: 320px; overflow: hidden; text-overflow: ellipsis; }
  .empty { color: var(--text-dim); padding: 24px; text-align: center; }

  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  @media (max-width: 768px) { .cols { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<div class="container">
  <header>
    <h1>SINFONIA <span>${esc(projectSlug)} — ${esc(projectName)}</span></h1>
    <button class="refresh-btn" onclick="triggerRefresh()">Refresh Poll</button>
  </header>

  <div class="stats">
    <div class="stat"><div class="stat-label">Agents</div><div class="stat-value green" id="s-agents">—</div></div>
    <div class="stat"><div class="stat-label">Completed</div><div class="stat-value cyan" id="s-completed">—</div></div>
    <div class="stat"><div class="stat-label">Tokens</div><div class="stat-value" id="s-tokens">—</div></div>
    <div class="stat"><div class="stat-label">Runtime</div><div class="stat-value" id="s-runtime">—</div></div>
    <div class="stat"><div class="stat-label">Retry Queue</div><div class="stat-value yellow" id="s-retries">—</div></div>
  </div>

  <div class="section">
    <h2>Running Agents</h2>
    <table>
      <thead><tr><th>ID</th><th>Stage</th><th>Age</th><th>Turn</th><th>Tokens</th><th>Session</th><th>Event</th></tr></thead>
      <tbody id="t-running"><tr><td colspan="7" class="empty">Loading...</td></tr></tbody>
    </table>
  </div>

  <div class="section">
    <h2>Backoff Queue</h2>
    <div id="t-retries"><div class="empty">Loading...</div></div>
  </div>

  <div class="cols">
    <div class="section">
      <h2>Scanners</h2>
      <div id="t-scanners"><div class="empty">Loading...</div></div>
    </div>
    <div class="section">
      <h2>Integrations</h2>
      <div id="t-integrations"><div class="empty">Loading...</div></div>
    </div>
  </div>
</div>

<script>
function fmt(n) {
  if (n >= 1e6) return (n/1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n/1e3).toFixed(0) + 'K';
  return String(n);
}
function dur(ms) {
  var s = Math.floor(ms/1000), m = Math.floor(s/60), h = Math.floor(m/60);
  if (h > 0) return h + 'h ' + (m%60) + 'm';
  if (m > 0) return m + 'm ' + (s%60) + 's';
  return s + 's';
}
function badge(state) {
  var s = state.toLowerCase();
  if (s === 'todo') return '<span class="badge badge-todo">Todo</span>';
  if (s === 'in progress') return '<span class="badge badge-progress">In Progress</span>';
  if (s === 'rework') return '<span class="badge badge-rework">Rework</span>';
  return '<span class="badge">' + state + '</span>';
}
function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

async function refresh() {
  try {
    var r = await fetch('/api/v1/state');
    var d = await r.json();

    document.getElementById('s-agents').textContent = d.running_sessions.length + '/' + d.max_agents;
    document.getElementById('s-completed').textContent = d.completed.length;
    document.getElementById('s-tokens').textContent = fmt(d.token_usage.total);
    document.getElementById('s-runtime').textContent = dur(d.runtime_ms);
    document.getElementById('s-retries').textContent = d.retry_queue.length;

    var tb = document.getElementById('t-running');
    if (d.running_sessions.length === 0) {
      tb.innerHTML = '<tr><td colspan="7" class="empty">No running agents</td></tr>';
    } else {
      tb.innerHTML = d.running_sessions.map(function(s) {
        var sid = s.session_id.slice(0,4) + '...' + s.session_id.slice(-4);
        return '<tr><td>' + esc(s.issue_identifier) + '</td><td>' + badge(s.state) + '</td><td>' + dur(s.elapsed_ms) + '</td><td>' + s.turn + '</td><td>' + fmt(s.tokens) + '</td><td>' + sid + '</td><td class="event">' + esc(s.last_event||'') + '</td></tr>';
      }).join('');
    }

    var rq = document.getElementById('t-retries');
    if (d.retry_queue.length === 0) {
      rq.innerHTML = '<div class="empty">No queued retries</div>';
    } else {
      rq.innerHTML = d.retry_queue.map(function(r) {
        var dueIn = Math.max(0, r.due_at_ms - Date.now());
        var type = r.is_continuation ? 'continuation' : 'retry';
        return '<div class="toggle-row"><span>' + esc(r.identifier) + ' — attempt ' + r.attempt + ' (' + type + ') due in ' + dur(dueIn) + '</span>' + (r.error ? '<span class="toggle-off">' + esc(r.error.slice(0,50)) + '</span>' : '') + '</div>';
      }).join('');
    }

    var sc = document.getElementById('t-scanners');
    if (d.scanners && d.scanners.length > 0) {
      sc.innerHTML = d.scanners.map(function(s) {
        return '<div class="toggle-row"><span class="toggle-name">' + esc(s.name) + '</span><span class="' + (s.enabled ? 'toggle-on' : 'toggle-off') + '">' + (s.enabled ? 'ON' : 'OFF') + '</span></div>';
      }).join('');
    } else {
      sc.innerHTML = '<div class="empty">No scanners configured</div>';
    }

    var ig = document.getElementById('t-integrations');
    if (d.integrations && d.integrations.length > 0) {
      ig.innerHTML = d.integrations.map(function(i) {
        return '<div class="toggle-row"><span class="toggle-name">' + esc(i.name) + '</span><span class="' + (i.enabled ? 'toggle-on' : 'toggle-off') + '">' + (i.enabled ? 'ON' : 'OFF') + '</span></div>';
      }).join('');
    } else {
      ig.innerHTML = '<div class="empty">No integrations configured</div>';
    }
  } catch(e) {
    console.error('Refresh failed:', e);
  }
}

async function triggerRefresh() {
  await fetch('/api/v1/refresh', {method:'POST'});
  refresh();
}

refresh();
setInterval(refresh, 2000);
</script>
</body>
</html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
