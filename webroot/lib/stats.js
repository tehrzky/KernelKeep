// ===== Stats & Kill history =====
let stats = {};

async function loadStats() {
  try {
    var res = await exec('cat "' + STATS_PATH + '" 2>/dev/null', 3000);
    if (res.stdout.trim()) {
      stats = JSON.parse(res.stdout);
      document.getElementById('statsApplied').textContent = stats.total_applied || 0;
      document.getElementById('statsFailed').textContent = stats.failed || 0;
      document.getElementById('statsLastRun').textContent = stats.last_run || 'Never';
    }
  } catch (e) {
    console.warn('loadStats error:', e);
  }
}

async function loadKillHistory() {
  try {
    var res = await exec('tail -20 "' + KILL_HISTORY + '" 2>/dev/null', 3000);
    document.getElementById('killHistoryView').textContent = res.stdout || 'No kills recorded yet.';
  } catch (e) {
    document.getElementById('killHistoryView').textContent = 'Error loading history.';
  }
}
