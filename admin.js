const SUPABASE_URL = 'https://vxlpbbtpzockgmklukki.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4bHBiYnRwem9ja2dta2x1a2tpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NTYzMTcsImV4cCI6MjA5ODIzMjMxN30.T8ma3-Tt0nAGaHdX5aXEKTzp46MWlAa_0lia1oCQA2U';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ROUNDS = ['RD32', 'RD16', 'QF', 'SF', 'Final'];
const ROUND_LABELS = {
  RD32: 'Round of 32',
  RD16: 'Round of 16',
  QF: 'Quarter Finals',
  SF: 'Semi Finals',
  Final: 'Final'
};

const state = {
  session: null,
  participants: [],
  matches: [],
  picks: [],
  activeTab: 'matches',
  activeParticipantId: null,
  isFirstRun: false
};

// ─── Bootstrap ───────────────────────────────────────────────────────────────

async function init() {
  const { data: { session } } = await db.auth.getSession();
  state.session = session;

  db.auth.onAuthStateChange((_event, session) => {
    state.session = session;
    if (session) {
      loadAndRenderAdmin();
    } else {
      renderLogin();
    }
  });

  if (session) {
    await loadAndRenderAdmin();
  } else {
    renderLogin();
  }
}

async function loadAndRenderAdmin() {
  document.getElementById('app').innerHTML = '<div class="loading">Loading…</div>';
  await loadData();
  state.activeParticipantId = state.participants[0]?.id ?? null;
  renderAdmin();
}

async function loadData() {
  const [pRes, mRes, pkRes] = await Promise.all([
    db.from('participants').select('*').order('name'),
    db.from('matches').select('*'),
    db.from('picks').select('*')
  ]);
  state.participants = pRes.data || [];
  state.matches     = mRes.data  || [];
  state.picks       = pkRes.data || [];
}

// ─── Auth views ──────────────────────────────────────────────────────────────

const COMMISSIONER_EMAIL = 'commissioner@pool.local';

function renderLogin() {
  document.getElementById('app').innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <h2>⚽ Commissioner Login</h2>
        <div class="form-group" style="margin-top:0.5rem">
          <label>Password</label>
          <input type="password" id="password" placeholder="••••••••" autocomplete="current-password">
        </div>
        <button class="btn btn-primary btn-block" onclick="login()">Sign In</button>
        <p id="auth-msg" class="status-msg" style="text-align:center;margin-top:0.75rem"></p>
        <p style="margin-top:1rem;text-align:center">
          <a href="index.html" style="font-size:0.78rem;color:var(--text-muted)">← Back to pool</a>
        </p>
      </div>
    </div>`;

  document.getElementById('password').addEventListener('keydown', e => {
    if (e.key === 'Enter') login();
  });
}

async function login() {
  const password = document.getElementById('password').value;
  const msg      = document.getElementById('auth-msg');

  msg.textContent = 'Signing in…';
  msg.className   = 'status-msg status-pending';

  const { error } = await db.auth.signInWithPassword({
    email: COMMISSIONER_EMAIL,
    password
  });
  if (error) {
    msg.textContent = 'Incorrect password.';
    msg.className   = 'status-msg status-err';
  }
  // Success is handled by onAuthStateChange
}

async function signOut() {
  await db.auth.signOut();
}

// ─── Admin shell ──────────────────────────────────────────────────────────────

function renderAdmin() {
  const email = state.session?.user?.email || '';

  document.getElementById('app').innerHTML = `
    <div class="admin-header">
      <span class="admin-header-title">⚽ WC 2026 — Commissioner Panel</span>
      <div class="admin-tabs">
        <button class="admin-tab ${state.activeTab === 'matches' ? 'active' : ''}"
          onclick="switchTab('matches', this)">Match Setup</button>
        <button class="admin-tab ${state.activeTab === 'picks' ? 'active' : ''}"
          onclick="switchTab('picks', this)">Enter Picks</button>
      </div>
      <div style="display:flex;align-items:center;gap:0.75rem;margin-left:auto">
        <span class="admin-user">${email}</span>
        <button class="btn btn-secondary btn-sm" onclick="signOut()">Sign Out</button>
        <a href="index.html" class="btn btn-secondary btn-sm">← Public View</a>
      </div>
    </div>
    <div class="admin-content" id="admin-content"></div>`;

  renderTab();
}

function switchTab(tab, el) {
  state.activeTab = tab;
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderTab();
}

function renderTab() {
  if (state.activeTab === 'matches') renderMatchesTab();
  else renderPicksTab();
}

// ─── Tab 1: Match Setup ───────────────────────────────────────────────────────

function renderMatchesTab() {
  const content = document.getElementById('admin-content');

  const sections = ROUNDS.map(round => {
    const roundMatches = state.matches
      .filter(m => m.round === round)
      .sort((a, b) => a.match_number - b.match_number);

    const rows = roundMatches.map(m => `
      <tr>
        <td style="color:var(--text-muted);font-size:0.82rem;white-space:nowrap">
          ${round} ${m.match_number}
        </td>
        <td><input class="pick-input" id="t1_${m.id}" type="text"
          value="${esc(m.team1 || '')}" placeholder="Team 1"></td>
        <td><input class="pick-input" id="t2_${m.id}" type="text"
          value="${esc(m.team2 || '')}" placeholder="Team 2"></td>
        <td><input class="pick-input" id="aw_${m.id}" type="text"
          value="${esc(m.actual_winner || '')}" placeholder="Actual winner"></td>
        <td style="white-space:nowrap">
          <button class="btn btn-primary btn-sm" onclick="saveMatch(${m.id})">Save</button>
          <span id="msg_${m.id}" class="status-msg" style="margin-left:0.4rem"></span>
        </td>
      </tr>`).join('');

    return `
      <div class="card" style="margin-bottom:1.25rem">
        <div class="card-header">${ROUND_LABELS[round]}</div>
        <div style="overflow-x:auto">
          <table class="match-setup-table">
            <thead>
              <tr>
                <th>Match</th>
                <th>Team 1</th>
                <th>Team 2</th>
                <th>Actual Winner</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }).join('');

  content.innerHTML = `
    <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:1rem">
      Fill in team names as the bracket becomes known. Set "Actual Winner" after each game is played — scores update automatically.
    </p>
    ${sections}`;
}

async function saveMatch(matchId) {
  const t1  = document.getElementById(`t1_${matchId}`).value.trim();
  const t2  = document.getElementById(`t2_${matchId}`).value.trim();
  const aw  = document.getElementById(`aw_${matchId}`).value.trim();
  const msg = document.getElementById(`msg_${matchId}`);

  msg.textContent = 'Saving…';
  msg.className   = 'status-msg status-pending';

  const { error } = await db.from('matches').update({
    team1:         t1 || null,
    team2:         t2 || null,
    actual_winner: aw || null
  }).eq('id', matchId);

  if (error) {
    msg.textContent = '✗ Error';
    msg.className   = 'status-msg status-err';
    console.error(error);
  } else {
    const m = state.matches.find(m => m.id === matchId);
    if (m) { m.team1 = t1 || null; m.team2 = t2 || null; m.actual_winner = aw || null; }
    msg.textContent = '✓ Saved';
    msg.className   = 'status-msg status-ok';
    setTimeout(() => { msg.textContent = ''; msg.className = 'status-msg'; }, 2500);
  }
}

// ─── Tab 2: Enter Picks ───────────────────────────────────────────────────────

function renderPicksTab() {
  const content = document.getElementById('admin-content');

  const pButtons = state.participants.map(p => `
    <button class="participant-btn ${p.id === state.activeParticipantId ? 'active' : ''}"
      onclick="selectParticipant(${p.id})">${p.name}</button>`).join('');

  const participant = state.participants.find(p => p.id === state.activeParticipantId);

  const pickCount = participant
    ? state.picks.filter(pk => pk.participant_id === participant.id).length
    : 0;

  const formHtml = participant ? buildPicksForm(participant) : '';

  content.innerHTML = `
    <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:1rem">
      Select a participant, enter their bracket picks, then click Save. Each correct pick = 3 pts.
    </p>
    <div class="participant-select">${pButtons}</div>
    ${participant ? `
      <div class="picks-form">
        <div class="picks-form-header">
          <h3>${participant.name}'s Bracket
            <span style="font-weight:400;font-size:0.82rem;color:var(--text-muted);margin-left:0.5rem">
              (${pickCount} / 31 picks entered)
            </span>
          </h3>
          <button class="btn btn-primary" onclick="saveAllPicks()">💾 Save All Picks</button>
        </div>
        <p id="picks-msg" class="status-msg"></p>
        ${formHtml}
      </div>` : ''}`;
}

function buildPicksForm(participant) {
  return ROUNDS.map(round => {
    const roundMatches = state.matches
      .filter(m => m.round === round)
      .sort((a, b) => a.match_number - b.match_number);

    const rows = roundMatches.map(m => {
      const pick  = state.picks.find(
        pk => pk.participant_id === participant.id && pk.match_id === m.id
      );
      const label = m.team1 && m.team2
        ? `${m.team1} vs ${m.team2}`
        : `${round} Match ${m.match_number}`;

      return `
        <div class="pick-row">
          <span class="pick-match-label" title="${label}">${label}</span>
          <input class="pick-input" id="pick_${m.id}" type="text"
            value="${esc(pick?.picked_winner || '')}" placeholder="Winner">
        </div>`;
    }).join('');

    return `
      <div class="round-section">
        <h4>${ROUND_LABELS[round]}</h4>
        <div class="picks-grid">${rows}</div>
      </div>`;
  }).join('');
}

function selectParticipant(id) {
  state.activeParticipantId = id;
  renderPicksTab();
}

async function saveAllPicks() {
  const msg = document.getElementById('picks-msg');
  const pid = state.activeParticipantId;

  msg.textContent = 'Saving…';
  msg.className   = 'status-msg status-pending';

  // Collect non-empty picks from inputs
  const toInsert = [];
  state.matches.forEach(m => {
    const input = document.getElementById(`pick_${m.id}`);
    if (!input) return;
    const val = input.value.trim();
    if (val) toInsert.push({ participant_id: pid, match_id: m.id, picked_winner: val });
  });

  // Delete existing picks for this participant, then re-insert
  const { error: delErr } = await db.from('picks')
    .delete()
    .eq('participant_id', pid);

  if (delErr) {
    msg.textContent = '✗ Error deleting old picks. Try again.';
    msg.className   = 'status-msg status-err';
    console.error(delErr);
    return;
  }

  if (toInsert.length > 0) {
    const { error: insErr } = await db.from('picks').insert(toInsert);
    if (insErr) {
      msg.textContent = '✗ Error saving picks. Try again.';
      msg.className   = 'status-msg status-err';
      console.error(insErr);
      return;
    }
  }

  // Update local state
  state.picks = state.picks.filter(pk => pk.participant_id !== pid);
  toInsert.forEach((u, i) => state.picks.push({ ...u, id: Date.now() + i }));

  const pName = state.participants.find(p => p.id === pid)?.name;
  msg.textContent = `✓ Saved ${toInsert.length} picks for ${pName}`;
  msg.className   = 'status-msg status-ok';

  // Refresh the pick count in the heading
  const countEl = document.querySelector('.picks-form-header h3 span');
  if (countEl) countEl.textContent = `(${toInsert.length} / 31 picks entered)`;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

init();
