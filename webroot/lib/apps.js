// ===== App list loading =====
let allApps = [];

async function loadInstalledApps() {
  try {
    var res = await exec('cat /data/adb/kernelkeep/apps.cache 2>/dev/null', 3000);
    if (res.errno !== 0 || !res.stdout.trim()) {
      document.getElementById('installedCount').textContent = 0;
      document.getElementById('appsCount').textContent = 0;
      showRefreshButton();
      return;
    }

    let section = '';
    const userApps = [];
    const sysApps = [];
    res.stdout.split('\n').forEach(function(line) {
      line = line.trim();
      if (!line) return;
      if (line === '#USER') { section = 'user'; return; }
      if (line === '#SYS') { section = 'sys'; return; }
      if (section === 'user') userApps.push(line);
      else if (section === 'sys') sysApps.push(line);
    });

    allApps = [];
    userApps.forEach(function(p) { allApps.push({ pkg: p, type: 'user' }); });
    sysApps.forEach(function(p) { allApps.push({ pkg: p, type: 'system' }); });
    allApps.sort(function(a, b) { return a.pkg.localeCompare(b.pkg); });
    document.getElementById('installedCount').textContent = allApps.length;
    document.getElementById('appsCount').textContent = allApps.length;
    hideRefreshButton();
  } catch (e) {
    console.warn('Failed to read cache', e);
    showRefreshButton();
  }
}

function showRefreshButton() {
  var container = document.getElementById('appsListContainer');
  if (!container) return;
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-title">App list not ready</div>
      <div style="margin-top:12px;">
        <button id="refreshAppsBtn" class="btn-pill add" style="padding:12px 24px;font-size:16px;">
          ⟳ Refresh Apps
        </button>
      </div>
      <div style="margin-top:8px;font-size:12px;color:var(--text-secondary);">
        This may take 10-20 seconds on first run.
      </div>
    </div>
  `;
  document.getElementById('refreshAppsBtn').addEventListener('click', function() {
    refreshCache();
  });
}

function hideRefreshButton() {
  if (allApps.length > 0) renderApps();
}

async function refreshCache() {
  toast('Refreshing app list... (may take 20s)');
  try {
    await exec('sh /data/adb/modules/kernelkeep/refresh_cache.sh', 30000);
    await new Promise(resolve => setTimeout(resolve, 2000));
    await loadInstalledApps();
    renderApps();
    toast('App list refreshed!');
  } catch (e) {
    toast('Refresh failed: ' + e.message);
  }
}
