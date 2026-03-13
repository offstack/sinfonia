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
    --surface-hover: #22263a;
    --border: #2a2d3a;
    --text: #e1e4ed;
    --text-dim: #8b8fa3;
    --accent: #6c8cff;
    --green: #4ade80;
    --yellow: #facc15;
    --red: #f87171;
    --cyan: #22d3ee;
    --sidebar-w: 200px;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: var(--bg); color: var(--text); font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', monospace; font-size: 13px; display: flex; min-height: 100vh; }

  /* ── Sidebar ────────────────────────────────────── */
  .sidebar { width: var(--sidebar-w); background: var(--surface); border-right: 1px solid var(--border); display: flex; flex-direction: column; position: fixed; top: 0; left: 0; bottom: 0; z-index: 10; }
  .sidebar-brand { padding: 20px 16px 16px; border-bottom: 1px solid var(--border); }
  .sidebar-brand h1 { font-size: 16px; font-weight: 700; color: var(--cyan); }
  .sidebar-brand .slug { font-size: 11px; color: var(--text-dim); margin-top: 4px; }
  .sidebar-nav { flex: 1; padding: 12px 8px; }
  .nav-item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 6px; cursor: pointer; color: var(--text-dim); font-size: 13px; margin-bottom: 2px; border: none; background: none; width: 100%; text-align: left; font-family: inherit; }
  .nav-item:hover { background: var(--surface-hover); color: var(--text); }
  .nav-item.active { background: rgba(108,140,255,0.12); color: var(--accent); }
  .nav-icon { width: 16px; text-align: center; }

  /* ── Main Content ───────────────────────────────── */
  .main { margin-left: var(--sidebar-w); flex: 1; padding: 24px 32px; }
  .main-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
  .main-header h2 { font-size: 18px; font-weight: 600; }
  .btn { background: var(--surface); border: 1px solid var(--border); color: var(--accent); padding: 6px 14px; border-radius: 6px; cursor: pointer; font-family: inherit; font-size: 12px; }
  .btn:hover { background: var(--border); }
  .btn-primary { background: rgba(108,140,255,0.15); border-color: var(--accent); }
  .btn-sm { padding: 4px 10px; font-size: 11px; }

  /* ── Page sections ──────────────────────────────── */
  .page { display: none; }
  .page.active { display: block; }

  /* ── Stats cards ────────────────────────────────── */
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 28px; }
  .stat { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
  .stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); margin-bottom: 4px; }
  .stat-value { font-size: 22px; font-weight: 700; }
  .stat-value.green { color: var(--green); }
  .stat-value.cyan { color: var(--cyan); }
  .stat-value.yellow { color: var(--yellow); }

  /* ── Section ────────────────────────────────────── */
  .section { margin-bottom: 28px; }
  .section-title { font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); margin-bottom: 10px; font-weight: 600; }

  /* ── Table ──────────────────────────────────────── */
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 8px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); border-bottom: 1px solid var(--border); }
  td { padding: 8px 12px; border-bottom: 1px solid var(--border); font-size: 13px; white-space: nowrap; }
  tr:hover td { background: var(--surface); }

  /* ── Badge ──────────────────────────────────────── */
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .badge-todo { background: rgba(34,211,238,0.15); color: var(--cyan); }
  .badge-progress { background: rgba(74,222,128,0.15); color: var(--green); }
  .badge-rework { background: rgba(250,204,21,0.15); color: var(--yellow); }
  .badge-done { background: rgba(108,140,255,0.15); color: var(--accent); }

  /* ── Toggle Row ─────────────────────────────────── */
  .toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; margin-bottom: 6px; }
  .toggle-name { font-weight: 500; }
  .toggle-on { color: var(--green); font-size: 11px; font-weight: 600; }
  .toggle-off { color: var(--text-dim); font-size: 11px; font-weight: 600; }

  /* ── Toggle Switch ──────────────────────────────── */
  .switch { position: relative; display: inline-block; width: 36px; height: 20px; cursor: pointer; }
  .switch input { opacity: 0; width: 0; height: 0; }
  .slider { position: absolute; inset: 0; background: var(--border); border-radius: 10px; transition: 0.2s; }
  .slider:before { content: ""; position: absolute; height: 14px; width: 14px; left: 3px; bottom: 3px; background: var(--text-dim); border-radius: 50%; transition: 0.2s; }
  .switch input:checked + .slider { background: var(--green); }
  .switch input:checked + .slider:before { transform: translateX(16px); background: white; }

  /* ── Event cell ─────────────────────────────────── */
  .event { color: var(--text-dim); max-width: 360px; overflow: hidden; text-overflow: ellipsis; }

  /* ── Empty state ────────────────────────────────── */
  .empty { color: var(--text-dim); padding: 24px; text-align: center; }

  /* ── Form elements ──────────────────────────────── */
  .form-group { margin-bottom: 16px; }
  .form-label { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); margin-bottom: 6px; }
  .form-input { background: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 8px 12px; border-radius: 6px; font-family: inherit; font-size: 13px; width: 100%; max-width: 320px; }
  .form-input:focus { outline: none; border-color: var(--accent); }
  select.form-input { cursor: pointer; }

  .form-row { display: flex; gap: 16px; flex-wrap: wrap; }
  .form-row .form-group { flex: 1; min-width: 200px; }

  /* ── Toast ──────────────────────────────────────── */
  .toast { position: fixed; bottom: 20px; right: 20px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px 20px; font-size: 13px; z-index: 100; opacity: 0; transform: translateY(10px); transition: all 0.3s; pointer-events: none; }
  .toast.show { opacity: 1; transform: translateY(0); }
  .toast.success { border-color: var(--green); color: var(--green); }
  .toast.error { border-color: var(--red); color: var(--red); }

  /* ── Grid layout ────────────────────────────────── */
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  @media (max-width: 900px) { .cols { grid-template-columns: 1fr; } .sidebar { display: none; } .main { margin-left: 0; } }

  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 20px; margin-bottom: 16px; }
  .card-title { font-size: 13px; font-weight: 600; margin-bottom: 12px; }
</style>
</head>
<body>

<!-- Sidebar -->
<div class="sidebar">
  <div class="sidebar-brand">
    <h1>SINFONIA</h1>
    <div class="slug" id="nav-slug">${esc(projectSlug)} — ${esc(projectName)}</div>
  </div>
  <nav class="sidebar-nav">
    <button class="nav-item active" data-page="overview"><span class="nav-icon">&#9632;</span> Overview</button>
    <button class="nav-item" data-page="agents"><span class="nav-icon">&#9654;</span> Agents</button>
    <button class="nav-item" data-page="scanners"><span class="nav-icon">&#9783;</span> Scanners</button>
    <button class="nav-item" data-page="integrations"><span class="nav-icon">&#8644;</span> Integrations</button>
    <button class="nav-item" data-page="settings"><span class="nav-icon">&#9881;</span> Settings</button>
  </nav>
</div>

<!-- Main -->
<div class="main">

  <!-- ═══════ OVERVIEW ═══════ -->
  <div class="page active" id="page-overview">
    <div class="main-header">
      <h2>Overview</h2>
      <button class="btn" onclick="triggerRefresh()">Refresh Poll</button>
    </div>

    <div class="stats">
      <div class="stat"><div class="stat-label">Agents</div><div class="stat-value green" id="s-agents">—</div></div>
      <div class="stat"><div class="stat-label">Completed</div><div class="stat-value cyan" id="s-completed">—</div></div>
      <div class="stat"><div class="stat-label">Tokens</div><div class="stat-value" id="s-tokens">—</div></div>
      <div class="stat"><div class="stat-label">Runtime</div><div class="stat-value" id="s-runtime">—</div></div>
      <div class="stat"><div class="stat-label">Retry Queue</div><div class="stat-value yellow" id="s-retries">—</div></div>
    </div>

    <div class="section">
      <div class="section-title">Running Agents</div>
      <table>
        <thead><tr><th>ID</th><th>Stage</th><th>Age</th><th>Turn</th><th>Tokens</th><th>Event</th></tr></thead>
        <tbody id="t-running"><tr><td colspan="6" class="empty">Loading...</td></tr></tbody>
      </table>
    </div>

    <div class="section">
      <div class="section-title">Backoff Queue</div>
      <div id="t-retries"><div class="empty">Loading...</div></div>
    </div>
  </div>

  <!-- ═══════ AGENTS ═══════ -->
  <div class="page" id="page-agents">
    <div class="main-header">
      <h2>Agents</h2>
      <button class="btn" onclick="triggerRefresh()">Refresh</button>
    </div>

    <div class="section">
      <div class="section-title">Running</div>
      <table>
        <thead><tr><th>Issue</th><th>Stage</th><th>Age</th><th>Turn</th><th>Tokens (in/out)</th><th>Session</th><th>Event</th></tr></thead>
        <tbody id="t-agents-running"><tr><td colspan="7" class="empty">No running agents</td></tr></tbody>
      </table>
    </div>

    <div class="section">
      <div class="section-title">Retry Queue</div>
      <table>
        <thead><tr><th>Issue</th><th>Attempt</th><th>Type</th><th>Due In</th><th>Error</th></tr></thead>
        <tbody id="t-agents-retry"><tr><td colspan="5" class="empty">No queued retries</td></tr></tbody>
      </table>
    </div>

    <div class="section">
      <div class="section-title">Completed</div>
      <div id="t-agents-completed"><div class="empty">No completed issues</div></div>
    </div>
  </div>

  <!-- ═══════ SCANNERS ═══════ -->
  <div class="page" id="page-scanners">
    <div class="main-header">
      <h2>Scanners</h2>
    </div>
    <p style="color:var(--text-dim);margin-bottom:16px;font-size:12px">Scanners use Claude Code CLI to analyze your codebase. Toggle modules on/off and configure their settings below. Changes are saved to sinfonia.yaml and hot-reloaded.</p>
    <div id="t-scanners-page"><div class="empty">Loading...</div></div>
  </div>

  <!-- ═══════ INTEGRATIONS ═══════ -->
  <div class="page" id="page-integrations">
    <div class="main-header">
      <h2>Integrations</h2>
    </div>
    <p style="color:var(--text-dim);margin-bottom:16px;font-size:12px">Integrations receive webhooks from external services and create Linear issues. Configure each integration below, then point the external service to the webhook URL shown.</p>
    <div id="t-integrations-page"><div class="empty">Loading...</div></div>

    <div class="card" style="margin-top:24px">
      <div class="card-title">Generic Webhook API</div>
      <p style="color:var(--text-dim);margin-bottom:12px;font-size:12px">Send any JSON payload to the generic endpoint — no signature required.</p>
      <pre style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:12px;font-size:11px;overflow-x:auto;color:var(--cyan)">curl -X POST http://localhost:<span id="generic-port">3100</span>/webhooks/generic \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Issue title",
    "description": "Details...",
    "severity": "high",
    "file": "src/server.ts",
    "type": "bug"
  }'</pre>
      <table style="margin-top:12px;font-size:12px">
        <thead><tr><th>Field</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td>title</td><td>string</td><td>Yes</td><td>Issue title</td></tr>
          <tr><td>description</td><td>string</td><td>No</td><td>Detailed description</td></tr>
          <tr><td>severity</td><td>string</td><td>No</td><td>critical, high, medium, low</td></tr>
          <tr><td>file</td><td>string</td><td>No</td><td>Related file path</td></tr>
          <tr><td>line</td><td>number</td><td>No</td><td>Line number</td></tr>
          <tr><td>type</td><td>string</td><td>No</td><td>security, performance, bug, etc.</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- ═══════ SETTINGS ═══════ -->
  <div class="page" id="page-settings">
    <div class="main-header">
      <h2>Settings</h2>
    </div>

    <div class="cols">
      <div>
        <div class="card">
          <div class="card-title">State Flow</div>
          <div class="form-group">
            <label class="form-label">On Dispatch</label>
            <input class="form-input" id="sf-dispatch" placeholder="In Progress">
          </div>
          <div class="form-group">
            <label class="form-label">On Success</label>
            <input class="form-input" id="sf-success" placeholder="Done">
          </div>
          <div class="form-group">
            <label class="form-label">On Failure (optional)</label>
            <input class="form-input" id="sf-failure" placeholder="Leave empty to disable">
          </div>
          <button class="btn btn-primary" onclick="saveStateFlow()">Save State Flow</button>
        </div>

        <div class="card">
          <div class="card-title">Orchestrator</div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Polling Interval (ms)</label>
              <input class="form-input" id="orch-poll" type="number" min="5000">
            </div>
            <div class="form-group">
              <label class="form-label">Max Concurrent Agents</label>
              <input class="form-input" id="orch-agents" type="number" min="1">
            </div>
          </div>
          <button class="btn btn-primary" onclick="saveOrchestrator()">Save Orchestrator</button>
        </div>
      </div>

      <div>
        <div class="card">
          <div class="card-title">Project</div>
          <div class="form-group">
            <label class="form-label">Current Project</label>
            <div id="settings-current" style="padding: 8px 0; font-weight: 600;">—</div>
          </div>
          <div class="form-group">
            <label class="form-label">Switch Project</label>
            <select class="form-input" id="settings-project">
              <option value="">Loading...</option>
            </select>
          </div>
          <button class="btn btn-primary" onclick="switchProject()">Switch</button>
        </div>

        <div class="card">
          <div class="card-title">Team States</div>
          <div id="settings-states"><div class="empty">Select a project to see available states</div></div>
        </div>
      </div>
    </div>
  </div>

</div>

<!-- Toast -->
<div class="toast" id="toast"></div>

<script>
// ── Utilities ──────────────────────────────────────
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
  if (s === 'done' || s === 'ready for review') return '<span class="badge badge-done">' + esc(state) + '</span>';
  return '<span class="badge">' + esc(state) + '</span>';
}
function esc(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function showToast(msg, type) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + (type || 'success');
  setTimeout(function() { t.className = 'toast'; }, 2500);
}

async function apiPost(url, body) {
  try {
    var r = await fetch(url, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body || {}) });
    var d = await r.json();
    if (d.success) { showToast('Updated successfully', 'success'); return d; }
    else { showToast(d.error || 'Failed', 'error'); return d; }
  } catch(e) { showToast('Request failed', 'error'); return { success: false }; }
}

// ── Navigation ─────────────────────────────────────
var currentPage = 'overview';
document.querySelectorAll('.nav-item').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var page = this.dataset.page;
    document.querySelectorAll('.nav-item').forEach(function(b) { b.classList.remove('active'); });
    this.classList.add('active');
    document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
    document.getElementById('page-' + page).classList.add('active');
    currentPage = page;
    location.hash = page;
    if (page === 'settings') loadSettings();
    if (page === 'scanners' || page === 'integrations') { configDataLoaded = false; loadConfigData(); }
  });
});

// Handle hash-based routing
if (location.hash) {
  var initPage = location.hash.slice(1);
  var initBtn = document.querySelector('[data-page="' + initPage + '"]');
  if (initBtn) initBtn.click();
}

// ── Data Refresh ───────────────────────────────────
var cachedState = null;

async function refresh() {
  try {
    var r = await fetch('/api/v1/state');
    var d = await r.json();
    cachedState = d;

    // Stats
    document.getElementById('s-agents').textContent = d.running_sessions.length + '/' + d.max_agents;
    document.getElementById('s-completed').textContent = d.completed.length;
    document.getElementById('s-tokens').textContent = fmt(d.token_usage.total);
    document.getElementById('s-runtime').textContent = dur(d.runtime_ms);
    document.getElementById('s-retries').textContent = d.retry_queue.length;

    // Overview: Running
    var tb = document.getElementById('t-running');
    if (d.running_sessions.length === 0) {
      tb.innerHTML = '<tr><td colspan="6" class="empty">No running agents</td></tr>';
    } else {
      tb.innerHTML = d.running_sessions.map(function(s) {
        return '<tr><td>' + esc(s.issue_identifier) + '</td><td>' + badge(s.state) + '</td><td>' + dur(s.elapsed_ms) + '</td><td>' + s.turn + '</td><td>' + fmt(s.tokens) + '</td><td class="event">' + esc(s.last_event||'') + '</td></tr>';
      }).join('');
    }

    // Overview: Retries
    var rq = document.getElementById('t-retries');
    if (d.retry_queue.length === 0) {
      rq.innerHTML = '<div class="empty">No queued retries</div>';
    } else {
      rq.innerHTML = d.retry_queue.map(function(r) {
        var dueIn = Math.max(0, r.due_at_ms - Date.now());
        var type = r.is_continuation ? 'continuation' : 'retry';
        return '<div class="toggle-row"><span>' + esc(r.identifier) + ' — attempt ' + r.attempt + ' (' + type + ') due in ' + dur(dueIn) + '</span>' + (r.error ? '<span style="color:var(--red)">' + esc(r.error.slice(0,50)) + '</span>' : '') + '</div>';
      }).join('');
    }

    // Agents page: Running (detailed)
    var ar = document.getElementById('t-agents-running');
    if (d.running_sessions.length === 0) {
      ar.innerHTML = '<tr><td colspan="7" class="empty">No running agents</td></tr>';
    } else {
      ar.innerHTML = d.running_sessions.map(function(s) {
        var sid = s.session_id ? (s.session_id.slice(0,4) + '...' + s.session_id.slice(-4)) : '—';
        return '<tr><td>' + esc(s.issue_identifier) + '</td><td>' + badge(s.state) + '</td><td>' + dur(s.elapsed_ms) + '</td><td>' + s.turn + '</td><td>' + fmt(s.tokens_in||0) + ' / ' + fmt(s.tokens_out||0) + '</td><td style="font-size:11px;color:var(--text-dim)">' + sid + '</td><td class="event">' + esc(s.last_event||'') + '</td></tr>';
      }).join('');
    }

    // Agents page: Retry
    var art = document.getElementById('t-agents-retry');
    if (d.retry_queue.length === 0) {
      art.innerHTML = '<tr><td colspan="5" class="empty">No queued retries</td></tr>';
    } else {
      art.innerHTML = d.retry_queue.map(function(r) {
        var dueIn = Math.max(0, r.due_at_ms - Date.now());
        return '<tr><td>' + esc(r.identifier) + '</td><td>' + r.attempt + '</td><td>' + (r.is_continuation ? 'continuation' : 'retry') + '</td><td>' + dur(dueIn) + '</td><td class="event">' + esc((r.error||'').slice(0,60)) + '</td></tr>';
      }).join('');
    }

    // Agents page: Completed
    var ac = document.getElementById('t-agents-completed');
    if (d.completed.length === 0) {
      ac.innerHTML = '<div class="empty">No completed issues</div>';
    } else {
      ac.innerHTML = d.completed.map(function(id) {
        return '<div class="toggle-row"><span>' + esc(id.slice(0,8)) + '...</span><span class="badge badge-done">Done</span></div>';
      }).join('');
    }

    // Update generic webhook port display
    if (d.integration_port) {
      var gp = document.getElementById('generic-port');
      if (gp) gp.textContent = d.integration_port;
    }

    // Only render scanner/integration cards if config is loaded
    if (!configDataLoaded) loadConfigData();

  } catch(e) {
    console.error('Refresh failed:', e);
  }
}

var configDataLoaded = false;
async function loadConfigData() {
  configDataLoaded = true;
  try {
    var cr = await fetch('/api/v1/config');
    var cd = await cr.json();
    if (!cd.success || !cd.config) return;
    renderScannersPage(cd.config.scanners || {});
    renderIntegrationsPage(cd.config.integrations || {}, cd.config);
  } catch(e) { console.error('Config load failed:', e); }
}

function renderScannersPage(scannersConfig) {
  var el = document.getElementById('t-scanners-page');
  var mods = scannersConfig.modules || {};
  var names = Object.keys(mods);
  if (names.length === 0) {
    el.innerHTML = '<div class="empty">No scanners configured. Add scanner modules to sinfonia.yaml.</div>';
    return;
  }
  var descs = { security: 'SQL injection, XSS, hardcoded secrets, SSRF', performance: 'N+1 queries, blocking ops, memory leaks', dry: 'Duplicated logic, copy-pasted functions', simplify: 'High complexity, deep nesting, dead code', custom: 'User-defined prompt-based scanner' };
  el.innerHTML = names.map(function(name) {
    var m = mods[name];
    var checked = m.enabled ? 'checked' : '';
    var desc = descs[name] || '';
    var inc = (m.include || []).join(', ');
    var html = '<div class="card">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">';
    html += '<div><span class="card-title" style="margin:0">' + esc(name) + '</span>';
    if (desc) html += '<span style="color:var(--text-dim);font-size:11px;margin-left:8px">' + esc(desc) + '</span>';
    html += '</div>';
    html += '<label class="switch"><input type="checkbox" ' + checked + ' onchange="toggleScanner(\\'' + esc(name) + '\\', this.checked)"><span class="slider"></span></label>';
    html += '</div>';
    // Config fields
    html += '<div class="form-row">';
    html += '<div class="form-group"><label class="form-label">Include patterns</label><input class="form-input" id="sc-' + name + '-include" value="' + esc(inc) + '" placeholder="src/**/*.ts"></div>';
    if (name === 'security') {
      html += '<div class="form-group"><label class="form-label">Severity Threshold</label><select class="form-input" id="sc-' + name + '-severity"><option' + (m.severity_threshold==='critical'?' selected':'') + '>critical</option><option' + (m.severity_threshold==='high'?' selected':'') + '>high</option><option' + (!m.severity_threshold||m.severity_threshold==='medium'?' selected':'') + '>medium</option><option' + (m.severity_threshold==='low'?' selected':'') + '>low</option></select></div>';
    }
    if (name === 'dry') {
      html += '<div class="form-group"><label class="form-label">Min Duplicate Lines</label><input class="form-input" id="sc-' + name + '-mindup" type="number" value="' + (m.min_duplicate_lines||10) + '" min="3"></div>';
    }
    if (name === 'simplify') {
      html += '<div class="form-group"><label class="form-label">Max Complexity</label><input class="form-input" id="sc-' + name + '-maxcx" type="number" value="' + (m.max_complexity||15) + '" min="1"></div>';
    }
    if (name === 'custom') {
      html += '<div class="form-group"><label class="form-label">Prompt File</label><input class="form-input" id="sc-' + name + '-prompt" value="' + esc(m.prompt_file||'') + '" placeholder="./my-scan.md"></div>';
    }
    html += '</div>';
    html += '<button class="btn btn-sm" onclick="saveScannerConfig(\\'' + esc(name) + '\\')">Save</button>';
    html += '</div>';
    return html;
  }).join('');
}

function renderIntegrationsPage(intConfig, fullConfig) {
  var el = document.getElementById('t-integrations-page');
  var sources = intConfig.sources || {};
  var port = intConfig.server_port || 3100;
  var names = Object.keys(sources);
  if (names.length === 0) {
    el.innerHTML = '<div class="empty">No integrations configured. Add sources to sinfonia.yaml.</div>';
    return;
  }
  var descs = { sentry: 'Receives Sentry error webhooks', github: 'Receives GitHub Dependabot + CI webhooks', slack: 'Receives Slack event webhooks', generic: 'Accepts any JSON payload (no signature needed)' };
  var headers = { sentry: 'sentry-hook-signature', github: 'x-hub-signature-256', slack: 'x-slack-signature' };
  el.innerHTML = names.map(function(name) {
    var src = sources[name];
    var checked = src.enabled ? 'checked' : '';
    var desc = descs[name] || '';
    var webhookUrl = 'http://&lt;your-server&gt;:' + port + '/webhooks/' + name;
    var html = '<div class="card">';
    // Header row with toggle
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">';
    html += '<div><span class="card-title" style="margin:0">' + esc(name) + '</span>';
    if (desc) html += '<span style="color:var(--text-dim);font-size:11px;margin-left:8px">' + esc(desc) + '</span>';
    html += '</div>';
    html += '<label class="switch"><input type="checkbox" ' + checked + ' onchange="toggleIntegration(\\'' + esc(name) + '\\', this.checked)"><span class="slider"></span></label>';
    html += '</div>';
    // Webhook URL
    html += '<div class="form-group"><label class="form-label">Webhook URL</label>';
    html += '<div style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px 12px;font-size:12px;color:var(--cyan);user-select:all">' + webhookUrl + '</div>';
    if (headers[name]) html += '<div style="color:var(--text-dim);font-size:11px;margin-top:4px">Signature header: <code>' + headers[name] + '</code> (HMAC-SHA256)</div>';
    html += '</div>';
    // Config fields
    html += '<div class="form-row">';
    if (name !== 'generic') {
      html += '<div class="form-group"><label class="form-label">Webhook Secret</label><input class="form-input" id="int-' + name + '-secret" type="password" value="" placeholder="' + (src.secret_set ? '(secret is set)' : 'Enter webhook secret') + '"></div>';
    }
    html += '<div class="form-group"><label class="form-label">Auto-triage</label><select class="form-input" id="int-' + name + '-triage"><option value="false"' + (!src.auto_triage?' selected':'') + '>Off — issues go to Backlog</option><option value="true"' + (src.auto_triage?' selected':'') + '>On — issues go to Todo (auto-fix)</option></select></div>';
    html += '</div>';
    // Integration-specific fields
    if (name === 'sentry') {
      html += '<div class="form-row">';
      html += '<div class="form-group"><label class="form-label">Min Occurrences</label><input class="form-input" id="int-sentry-minocc" type="number" value="' + (src.min_occurrences||5) + '" min="1"></div>';
      html += '<div class="form-group"><label class="form-label">Ignore Environments</label><input class="form-input" id="int-sentry-ignenv" value="' + esc((src.ignore_environments||[]).join(', ')) + '" placeholder="staging, dev"></div>';
      html += '</div>';
    }
    if (name === 'github') {
      html += '<div class="form-row">';
      html += '<div class="form-group"><label class="form-label">Events</label><input class="form-input" id="int-github-events" value="' + esc((src.events||[]).join(', ')) + '" placeholder="dependabot_alert"></div>';
      html += '</div>';
    }
    html += '<button class="btn btn-sm" onclick="saveIntegrationConfig(\\'' + esc(name) + '\\')">Save</button>';
    html += '</div>';
    return html;
  }).join('');
}

// ── Actions ────────────────────────────────────────
async function triggerRefresh() {
  await fetch('/api/v1/refresh', {method:'POST'});
  showToast('Poll refresh triggered', 'success');
  setTimeout(refresh, 500);
}

async function toggleScanner(name, enabled) {
  await apiPost('/api/v1/scanners/' + name + '/toggle', { enabled: enabled });
}

async function toggleIntegration(name, enabled) {
  await apiPost('/api/v1/integrations/' + name + '/toggle', { enabled: enabled });
}

async function saveScannerConfig(name) {
  var body = {};
  var inc = document.getElementById('sc-' + name + '-include');
  if (inc) {
    var val = inc.value.trim();
    body.include = val ? val.split(',').map(function(s) { return s.trim(); }).filter(Boolean) : [];
  }
  var sev = document.getElementById('sc-' + name + '-severity');
  if (sev) body.severity_threshold = sev.value;
  var mindup = document.getElementById('sc-' + name + '-mindup');
  if (mindup) body.min_duplicate_lines = parseInt(mindup.value) || 10;
  var maxcx = document.getElementById('sc-' + name + '-maxcx');
  if (maxcx) body.max_complexity = parseInt(maxcx.value) || 15;
  var prompt = document.getElementById('sc-' + name + '-prompt');
  if (prompt) body.prompt_file = prompt.value.trim();
  var res = await apiPost('/api/v1/scanners/' + name + '/config', body);
  if (res.success) { configDataLoaded = false; loadConfigData(); }
}

async function saveIntegrationConfig(name) {
  var body = {};
  var secret = document.getElementById('int-' + name + '-secret');
  if (secret && secret.value) body.secret = secret.value;
  var triage = document.getElementById('int-' + name + '-triage');
  if (triage) body.auto_triage = triage.value === 'true';
  // Sentry-specific
  var minocc = document.getElementById('int-sentry-minocc');
  if (minocc) body.min_occurrences = parseInt(minocc.value) || 5;
  var ignenv = document.getElementById('int-sentry-ignenv');
  if (ignenv) {
    var val = ignenv.value.trim();
    body.ignore_environments = val ? val.split(',').map(function(s) { return s.trim(); }).filter(Boolean) : [];
  }
  // GitHub-specific
  var events = document.getElementById('int-github-events');
  if (events) {
    var val = events.value.trim();
    body.events = val ? val.split(',').map(function(s) { return s.trim(); }).filter(Boolean) : [];
  }
  var res = await apiPost('/api/v1/integrations/' + name + '/config', body);
  if (res.success) { configDataLoaded = false; loadConfigData(); }
}

async function saveStateFlow() {
  var d = document.getElementById('sf-dispatch').value.trim();
  var s = document.getElementById('sf-success').value.trim();
  var f = document.getElementById('sf-failure').value.trim();
  var body = {};
  if (d) body.on_dispatch = d;
  if (s) body.on_success = s;
  body.on_failure = f; // empty string clears it
  await apiPost('/api/v1/config/state-flow', body);
}

async function saveOrchestrator() {
  var poll = parseInt(document.getElementById('orch-poll').value);
  var agents = parseInt(document.getElementById('orch-agents').value);
  var body = {};
  if (!isNaN(poll) && poll >= 5000) body.polling_interval_ms = poll;
  if (!isNaN(agents) && agents >= 1) body.max_concurrent_agents = agents;
  await apiPost('/api/v1/config/orchestrator', body);
}

async function switchProject() {
  var sel = document.getElementById('settings-project');
  var slug = sel.value;
  if (!slug) return showToast('Select a project first', 'error');
  await apiPost('/api/v1/projects/use', { slug: slug });
  showToast('Project switched to ' + slug + '. Restart Sinfonia to apply.', 'success');
}

// ── Settings Load ──────────────────────────────────
var settingsLoaded = false;
async function loadSettings() {
  try {
    // Load config
    var cr = await fetch('/api/v1/config');
    var cd = await cr.json();
    if (cd.success && cd.config) {
      var sf = cd.config.orchestrator.state_flow || {};
      document.getElementById('sf-dispatch').value = sf.on_dispatch || '';
      document.getElementById('sf-success').value = sf.on_success || '';
      document.getElementById('sf-failure').value = sf.on_failure || '';
      document.getElementById('orch-poll').value = cd.config.orchestrator.polling_interval_ms || 30000;
      document.getElementById('orch-agents').value = cd.config.orchestrator.max_concurrent_agents || 5;
      document.getElementById('settings-current').textContent = cd.config.tracker.project_slug;
    }

    // Load projects
    if (!settingsLoaded) {
      settingsLoaded = true;
      var pr = await fetch('/api/v1/projects');
      var pd = await pr.json();
      if (pd.success && pd.teams) {
        var sel = document.getElementById('settings-project');
        sel.innerHTML = '<option value="">— select —</option>' + pd.teams.map(function(t) {
          var selected = t.key === pd.current ? ' selected' : '';
          return '<option value="' + esc(t.key) + '"' + selected + '>' + esc(t.key) + ' — ' + esc(t.name) + '</option>';
        }).join('');

        // Show states for current project
        var curTeam = pd.teams.find(function(t) { return t.key === pd.current; });
        if (curTeam && curTeam.states) {
          document.getElementById('settings-states').innerHTML = curTeam.states.map(function(s) {
            return '<span class="badge" style="margin: 2px 4px;">' + esc(s) + '</span>';
          }).join('');
        }

        // Update states on selection change
        sel.addEventListener('change', function() {
          var team = pd.teams.find(function(t) { return t.key === sel.value; });
          if (team && team.states) {
            document.getElementById('settings-states').innerHTML = team.states.map(function(s) {
              return '<span class="badge" style="margin: 2px 4px;">' + esc(s) + '</span>';
            }).join('');
          }
        });
      }
    }
  } catch(e) {
    console.error('Failed to load settings:', e);
  }
}

// ── Start ──────────────────────────────────────────
refresh();
setInterval(refresh, 2000);
</script>
</body>
</html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
