// ===== KERNELKEEP — MAIN ENTRY =====
// This file only loads everything and initializes.

// Global constants (used across all files)
const LIST_PATH = '/data/adb/kernelkeep/apps.list';
const LOG_PATH = '/data/adb/kernelkeep/kernelkeep.log';
const HIBERNATE_PATH = '/data/adb/kernelkeep/hibernate.list';
const STATS_PATH = '/data/adb/kernelkeep/stats.json';
const KILL_HISTORY = '/data/adb/kernelkeep/kill_history.log';

// ═══ INIT ═══
document.addEventListener('DOMContentLoaded', async function() {
  try {
    await loadDeviceInfo();
    await loadSavedApps();
    await loadInstalledApps();
    await loadHibernateApps();
    await loadStats();
    await loadKillHistory();
    await loadScheduleStatus();
    await loadBatchSize();
    await loadBootCount();
    await loadSafeModeStatus();
    renderSaved();
    renderApps();

    // Button bindings (must be after DOM ready)
    document.getElementById('refreshStats').addEventListener('click', function() {
      loadStats();
      loadKillHistory();
      toast('Stats refreshed');
    });
    document.getElementById('verifyBtn').addEventListener('click', verifyApps);
    document.getElementById('exportBtn').addEventListener('click', exportConfig);
    document.getElementById('importBtn').addEventListener('click', importConfig);
  } catch (e) {
    console.error('Init error:', e);
  }
});
