const SUPABASE_URL = 'https://vxlpbbtpzockgmklukki.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4bHBiYnRwem9ja2dta2x1a2tpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NTYzMTcsImV4cCI6MjA5ODIzMjMxN30.T8ma3-Tt0nAGaHdX5aXEKTzp46MWlAa_0lia1oCQA2U';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ROUND_ORDER = ['RD32', 'RD16', 'QF', 'SF', 'Final'];
const ROUND_LABELS = {
  RD32: 'Round of 32',
  RD16: 'Round of 16',
  QF: 'Quarter Finals',
  SF: 'Semi Finals',
  Final: 'Final'
};

// Official tournament match numbers (match_number 1 in each round maps to these offsets)
const OFFICIAL_OFFSET = { RD32: 72, RD16: 88, QF: 96, SF: 100, Final: 102 };

function matchLabel(match) {
  const official = `Match ${OFFICIAL_OFFSET[match.round] + match.match_number}`;
  if (match.round === 'RD32' && match.team1 && match.team2) {
    return { primary: `${match.team1} vs ${match.team2}`, sub: official };
  }
  return { primary: official, sub: null };
}

let state = {
  participants: [],
  matches: [],
  picks: [],
  currentRound: 'RD32'
};

async function init() {
  try {
    const [pRes, mRes, pkRes] = await Promise.all([
      db.from('participants').select('*').order('name'),
      db.from('matches').select('*'),
      db.from('picks').select('*')
    ]);

    state.participants = pRes.data || [];
    state.matches = mRes.data || [];
    state.picks = pkRes.data || [];

    renderLeaderboard();
    renderBracket(state.currentRound);
    setupTabs();
  } catch (err) {
    document.getElementById('leaderboard-body').innerHTML =
      `<div class="loading" style="color:#e57373">Failed to load data. Check your connection.</div>`;
  }
}

function calcScores() {
  return state.participants.map(p => {
    const myPicks = state.picks.filter(pk => pk.participant_id === p.id);
    let points = 0, correct = 0, decided = 0;

    myPicks.forEach(pk => {
      const match = state.matches.find(m => m.id === pk.match_id);
      if (match?.actual_winner) {
        decided++;
        if (pk.picked_winner === match.actual_winner) {
          correct++;
          points += 3;
        }
      }
    });

    return { ...p, points, correct, decided };
  }).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}

function renderLeaderboard() {
  const scores = calcScores();
  const decidedMatches = state.matches.filter(m => m.actual_winner).length;

  if (!scores.length) {
    document.getElementById('leaderboard-body').innerHTML =
      `<div class="loading">No participants loaded yet.</div>`;
    return;
  }

  const rows = scores.map((s, i) => `
    <tr class="${i === 0 && s.points > 0 ? 'rank-1' : ''}">
      <td class="rank">${i + 1}</td>
      <td class="name">${s.name}</td>
      <td class="points">${s.points}</td>
      <td>${s.correct} / ${s.decided}</td>
    </tr>
  `).join('');

  document.getElementById('leaderboard-body').innerHTML = `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Player</th>
          <th>Points</th>
          <th>Correct Picks (of ${decidedMatches} played)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderBracket(round) {
  const grid = document.getElementById('bracket-grid');
  const roundMatches = state.matches
    .filter(m => m.round === round)
    .sort((a, b) => a.match_number - b.match_number);

  if (!roundMatches.length) {
    grid.innerHTML = `<div class="loading">No matches set for this round yet.</div>`;
    return;
  }

  const pCols = state.participants.map(p => `<th>${p.name}</th>`).join('');

  const rows = roundMatches.map(match => {
    const { primary, sub } = matchLabel(match);
    const label = sub
      ? `${primary}<span class="vs">${sub}</span>`
      : primary;

    const cells = state.participants.map(p => {
      const pick = state.picks.find(
        pk => pk.participant_id === p.id && pk.match_id === match.id
      );
      const val = pick?.picked_winner || '—';
      let cls = '';
      if (match.actual_winner && pick) {
        cls = pick.picked_winner === match.actual_winner ? 'correct' : 'wrong';
      }
      return `<td class="${cls}">${val}</td>`;
    }).join('');

    const winnerCell = match.actual_winner
      ? `<td class="actual">✓ ${match.actual_winner}</td>`
      : `<td class="tbd">TBD</td>`;

    return `<tr><td class="match-label">${label}</td>${cells}${winnerCell}</tr>`;
  }).join('');

  grid.innerHTML = `
    <div class="bracket-table-wrap">
      <table class="bracket-table">
        <thead>
          <tr>
            <th>Match</th>
            ${pCols}
            <th>Winner</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.currentRound = tab.dataset.round;
      renderBracket(state.currentRound);
    });
  });
}

init();
