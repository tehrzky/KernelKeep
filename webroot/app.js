// KernelKeep — Full Feature WebUI
(function() {
  'use strict';

  const LIST_PATH = '/data/adb/kernelkeep/apps.list';
  const LOG_PATH = '/data/adb/kernelkeep/kernelkeep.log';
  const HIBERNATE_PATH = '/data/adb/kernelkeep/hibernate.list';
  const STATS_PATH = '/data/adb/kernelkeep/stats.json';
  const KILL_HISTORY = '/data/adb/kernelkeep/kill_history.log';

  let savedApps = [];
  let hibernateApps = [];
  let allApps = [];
  let currentFilter = 'all';
  let labelCache = {};
  let iconCache = {};
  let stats = {};
  let killHistory = [];

  // ═══ EXEC WRAPPER ═══
  function exec(cmd, timeout) {
    timeout = timeout || 8000;
    return new Promise(function(resolve, reject) {
      if (typeof ksu === 'undefined' || typeof ksu.exec !== 'function') {
        reject(new Error('ksu.exec not available'));
        return;
      }
      const name = 'ksu_cb_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
      let resolved = false;
      const timer = setTimeout(function() {
        if (!resolved) {
          resolved = true;
          delete window[name];
          reject(new Error('exec timeout: ' + cmd));
        }
      }, timeout);
      window[name] = function(errno, stdout, stderr) {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        delete window[name];
        resolve({ errno: errno, stdout: stdout || '', stderr: stderr || '' });
      };
      try {
        ksu.exec(cmd, '{}', name);
      } catch (e) {
        clearTimeout(timer);
        delete window[name];
        reject(e);
      }
    });
  }

  function toast(msg, dur) {
    dur = dur || 2200;
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(function() { el.classList.remove('show'); }, dur);
  }

  function switchTab(page) {
    var items = document.querySelectorAll('.nav-item');
    for (var i = 0; i < items.length; i++) items[i].classList.remove('active');
    var pages = document.querySelectorAll('.page');
    for (var i = 0; i < pages.length; i++) pages[i].classList.remove('active');

    var btnMap = { home: 'navHome', apps: 'navApps', logs: 'navLogs' };
    var btn = document.getElementById(btnMap[page]);
    if (btn) btn.classList.add('active');
    var pageEl = document.getElementById('page-' + page);
    if (pageEl) pageEl.classList.add('active');
    if (page === 'logs') loadLogs();
  }

  document.getElementById('navHome').addEventListener('click', function() { switchTab('home'); });
  document.getElementById('navApps').addEventListener('click', function() { switchTab('apps'); });
  document.getElementById('navLogs').addEventListener('click', function() { switchTab('logs'); });

  // ═══ Device info ═══
  async function loadDeviceInfo() {
    try {
      var manuf = (await exec("getprop ro.product.manufacturer")).stdout.trim();
      var model = (await exec("getprop ro.product.model")).stdout.trim();
      var android = (await exec("getprop ro.build.version.release")).stdout.trim();
      var sdk = (await exec("getprop ro.build.version.sdk")).stdout.trim();
      var kernel = (await exec("uname -r")).stdout.trim();
      var arch = (await exec("getprop ro.product.cpu.abi")).stdout.trim();

      document.getElementById('infoDevice').textContent = (manuf || 'Unknown') + ' ' + (model || '');
      document.getElementById('infoAndroid').textContent = 'API ' + (sdk || '?') + ' (' + (android || 'Unknown') + ')';
      document.getElementById('infoOEM').textContent = manuf || 'Unknown';
      document.getElementById('infoKernel').textContent = kernel || 'Unknown';
      document.getElementById('statusMeta').textContent = 'Version 2.2.0 (' + (arch || 'Unknown') + ')';
    } catch (e) {
      console.warn('Device info partial', e);
    }
  }

  // ═══ Get installed apps (cache) ═══
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
    var container = document.getElementById('appsList');
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

  // ═══ Load saved apps and hibernate list ═══
  async function loadSavedApps() {
    try {
      var res = await exec('cat "' + LIST_PATH + '" 2>/dev/null', 3000);
      savedApps = res.stdout.split('\n').map(function(l) { return l.trim(); }).filter(function(l) { return l && !l.startsWith('#'); });
      document.getElementById('savedCount').textContent = savedApps.length;
      document.getElementById('protectedCount').textContent = savedApps.length;
    } catch (e) {
      console.warn('loadSavedApps error:', e);
    }
  }

  async function loadHibernateApps() {
    try {
      var res = await exec('cat "' + HIBERNATE_PATH + '" 2>/dev/null', 3000);
      hibernateApps = res.stdout.split('\n').map(function(l) { return l.trim(); }).filter(function(l) { return l && !l.startsWith('#'); });
      document.getElementById('hibernateCount').textContent = hibernateApps.length;
    } catch (e) {
      console.warn('loadHibernateApps error:', e);
    }
  }

  // ═══ Load stats ═══
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

  // ═══ Load kill history ═══
  async function loadKillHistory() {
    try {
      var res = await exec('tail -20 "' + KILL_HISTORY + '" 2>/dev/null', 3000);
      document.getElementById('killHistoryView').textContent = res.stdout || 'No kills recorded yet.';
    } catch (e) {
      document.getElementById('killHistoryView').textContent = 'Error loading history.';
    }
  }

  // ═══ Verification ═══
  async function verifyApps() {
    toast('Verifying...');
    var results = [];
    for (var i = 0; i < Math.min(savedApps.length, 10); i++) {
      var pkg = savedApps[i];
      var res = await exec('dumpsys deviceidle whitelist | grep "' + pkg + '"', 3000);
      if (res.stdout.trim()) {
        results.push('✓ ' + pkg + ': whitelisted');
      } else {
        results.push('✗ ' + pkg + ': NOT whitelisted');
      }
    }
    if (savedApps.length > 10) {
      results.push('... and ' + (savedApps.length - 10) + ' more');
    }
    var msg = results.join('\n');
    alert('Verification Results:\n\n' + (msg || 'No apps to verify'));
  }

  // ═══ Export/Import ═══
  async function exportConfig() {
    try {
      var res = await exec('cat "' + LIST_PATH + '" 2>/dev/null', 3000);
      var content = res.stdout;
      var blob = new Blob([content], { type: 'text/plain' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'kernelkeep_backup.txt';
      a.click();
      toast('Export complete!');
    } catch (e) {
      toast('Export failed: ' + e.message);
    }
  }

  async function importConfig() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt';
    input.onchange = function(e) {
      var file = e.target.files[0];
      var reader = new FileReader();
      reader.onload = async function(ev) {
        try {
          var content = ev.target.result;
          await exec("cat > '" + LIST_PATH + "' <<'EOF'\n" + content + "\nEOF", 5000);
          toast('Import complete! Reboot to apply.');
          await loadSavedApps();
          renderSaved();
        } catch (err) {
          toast('Import failed: ' + err.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  // ═══ Label & Icon Fetching ═══
  async function fetchLabel(pkg) {
    if (labelCache[pkg]) return labelCache[pkg];
    try {
      var res = await exec('dumpsys package "' + pkg + '" 2>/dev/null | grep -E "labelRes|nonLocalizedLabel" | head -1', 2000);
      var match = res.stdout.match(/labelRes=0x[0-9a-f]+ '([^']+)'/);
      if (match && match[1]) {
        labelCache[pkg] = match[1];
        return match[1];
      }
      match = res.stdout.match(/nonLocalizedLabel=([^ ]+)/);
      if (match && match[1]) {
        labelCache[pkg] = match[1].replace(/[{}]/g, '').trim();
        return labelCache[pkg];
      }
      var simple = pkg.replace(/^(com\.|org\.|net\.|app\.)/, '');
      labelCache[pkg] = simple;
      return simple;
    } catch (e) {
      labelCache[pkg] = pkg;
      return pkg;
    }
  }

  async function fetchIcon(pkg) {
    if (iconCache[pkg]) return iconCache[pkg];
    try {
      var apkRes = await exec('pm path "' + pkg + '" 2>/dev/null | head -1 | cut -d: -f2', 2000);
      var apk = apkRes.stdout.trim();
      if (!apk) { iconCache[pkg] = null; return null; }
      var listRes = await exec('unzip -l "' + apk + '" 2>/dev/null | grep -E "mipmap-.*ic_launcher\\.(png|webp)" | awk \'{print $4}\' | head -1', 2000);
      var iconPath = listRes.stdout.trim();
      if (!iconPath) { iconCache[pkg] = null; return null; }
      var b64Res = await exec('unzip -p "' + apk + '" "' + iconPath + '" 2>/dev/null | base64 -w 0', 3000);
      var b64 = b64Res.stdout.trim();
      if (b64 && b64.length > 100) {
        var ext = iconPath.endsWith('.webp') ? 'webp' : 'png';
        var uri = 'data:image/' + ext + ';base64,' + b64;
        iconCache[pkg] = uri;
        return uri;
      }
    } catch (e) {}
    iconCache[pkg] = null;
    return null;
  }

  function getFallbackIcon(pkg) {
    var colors = ['#ef4444','#f97316','#eab308','#84cc16','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#d946ef','#f43f5e'];
    var hash = 0;
    for (var i = 0; i < pkg.length; i++) hash = (hash + pkg.charCodeAt(i)) % colors.length;
    var initial = pkg.replace(/^(com\.|org\.|net\.|app\.)/, '').charAt(0).toUpperCase() || pkg.charAt(0).toUpperCase();
    return { color: colors[hash], initial: initial };
  }

  function renderAppIcon(pkg, elementId) {
    var el = document.getElementById(elementId);
    if (!el) return;
    var cached = iconCache[pkg];
    if (cached) {
      el.innerHTML = '<img src="' + cached + '" style="width:48px;height:48px;border-radius:12px;object-fit:cover;">';
      return;
    }
    var fb = getFallbackIcon(pkg);
    el.innerHTML = '<span style="display:flex;align-items:center;justify-content:center;width:48px;height:48px;background:' + fb.color + ';color:#fff;font-size:20px;font-weight:700;border-radius:12px;">' + fb.initial + '</span>';
    if (iconCache[pkg] === undefined) {
      (async function(p) {
        var icon = await fetchIcon(p);
        var e = document.getElementById(elementId);
        if (e && icon) {
          e.innerHTML = '<img src="' + icon + '" style="width:48px;height:48px;border-radius:12px;object-fit:cover;">';
        }
      })(pkg);
    }
  }

  // ═══ Rendering ═══
  function renderSaved() {
    var container = document.getElementById('savedList');
    if (!container) return;
    if (savedApps.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-title">No protected apps</div><div>Add apps from below</div></div>';
      return;
    }
    var html = '';
    for (var i = 0; i < savedApps.length; i++) {
      var pkg = savedApps[i];
      var label = labelCache[pkg] || pkg;
      var sid = pkg.replace(/[^a-zA-Z0-9]/g, '-');
      html += '<div class="app-row" data-pkg="' + pkg + '">' +
        '<div class="app-icon" id="si-' + sid + '">' +
        '<span style="display:flex;align-items:center;justify-content:center;width:48px;height:48px;background:#333;color:#fff;font-size:20px;font-weight:700;border-radius:12px;">?</span>' +
        '</div>' +
        '<div class="app-meta">' +
        '<div class="app-name" id="sl-' + sid + '">' + label + '</div>' +
        '<div class="app-pkg">' + pkg + '</div>' +
        '</div>' +
        '<button class="btn-pill remove" data-action="remove" data-pkg="' + pkg + '">Remove</button>' +
        '</div>';
    }
    container.innerHTML = html;
    for (var i = 0; i < savedApps.length; i++) {
      var pkg = savedApps[i];
      var sid = pkg.replace(/[^a-zA-Z0-9]/g, '-');
      renderAppIcon(pkg, 'si-' + sid);
      if (!labelCache[pkg]) {
        (async function(p) {
          var lbl = await fetchLabel(p);
          var el = document.getElementById('sl-' + p.replace(/[^a-zA-Z0-9]/g, '-'));
          if (el) el.textContent = lbl;
        })(pkg);
      }
    }
  }

  function renderApps() {
    var container = document.getElementById('appsList');
    if (!container) return;
    var q = document.getElementById('appSearch').value.trim().toLowerCase();
    var filtered = allApps.filter(function(a) {
      if (currentFilter !== 'all' && a.type !== currentFilter) return false;
      if (q) {
        var label = (labelCache[a.pkg] || a.pkg).toLowerCase();
        return a.pkg.toLowerCase().includes(q) || label.includes(q);
      }
      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-title">No apps found</div></div>';
      return;
    }

    var html = '';
    for (var i = 0; i < filtered.length; i++) {
      var app = filtered[i];
      var pkg = app.pkg;
      var isSaved = savedApps.includes(pkg);
      var isHibernated = hibernateApps.includes(pkg);
      var btnClass = isSaved ? 'saved' : 'add';
      var btnText = isSaved ? 'Saved' : 'Add';
      var label = labelCache[pkg] || pkg;
      var sid = pkg.replace(/[^a-zA-Z0-9]/g, '-');
      var badges = '<span class="badge ' + (app.type === 'user' ? 'green' : 'orange') + '">' + app.type + '</span>';
      if (isHibernated) badges += ' <span class="badge red">Hibernated</span>';
      html += '<div class="app-row" data-pkg="' + pkg + '">' +
        '<div class="app-icon" id="ai-' + sid + '">' +
        '<span style="display:flex;align-items:center;justify-content:center;width:48px;height:48px;background:#333;color:#fff;font-size:20px;font-weight:700;border-radius:12px;">?</span>' +
        '</div>' +
        '<div class="app-meta">' +
        '<div class="app-name" id="al-' + sid + '">' + label + '</div>' +
        '<div class="app-pkg">' + pkg + '</div>' +
        '<div class="app-badges">' + badges + '</div>' +
        '</div>' +
        '<button class="btn-pill ' + btnClass + '" data-action="add" data-pkg="' + pkg + '">' + btnText + '</button>' +
        '</div>';
    }
    container.innerHTML = html;
    for (var i = 0; i < filtered.length; i++) {
      var pkg = filtered[i].pkg;
      var sid = pkg.replace(/[^a-zA-Z0-9]/g, '-');
      renderAppIcon(pkg, 'ai-' + sid);
      if (!labelCache[pkg]) {
        (async function(p) {
          var lbl = await fetchLabel(p);
          var el = document.getElementById('al-' + p.replace(/[^a-zA-Z0-9]/g, '-'));
          if (el) el.textContent = lbl;
        })(pkg);
      }
    }
  }

  // ═══ Add/Remove/Hibernate ═══
  async function addApp(pkg) {
    if (savedApps.includes(pkg)) { toast('Already saved'); return; }
    savedApps.push(pkg);
    await writeList();
    toast('Added ' + (labelCache[pkg] || pkg));
    renderApps();
    renderSaved();
    document.getElementById('savedCount').textContent = savedApps.length;
    document.getElementById('protectedCount').textContent = savedApps.length;
  }

  async function removeApp(pkg) {
    savedApps = savedApps.filter(function(a) { return a !== pkg; });
    await writeList();
    renderSaved();
    renderApps();
    toast('Removed ' + (labelCache[pkg] || pkg));
    document.getElementById('savedCount').textContent = savedApps.length;
    document.getElementById('protectedCount').textContent = savedApps.length;
  }

  async function writeList() {
    var lines = ['# KernelKeep — one package per line', '# Lines starting with # are ignored', ''];
    lines.push.apply(lines, savedApps);
    await exec("cat > '" + LIST_PATH + "' <<'EOF'\n" + lines.join('\n') + "\nEOF", 5000);
  }

  // ═══ Hibernate functions ═══
  async function addHibernate(pkg) {
    if (hibernateApps.includes(pkg)) { toast('Already hibernated'); return; }
    hibernateApps.push(pkg);
    await writeHibernateList();
    toast('Hibernated ' + (labelCache[pkg] || pkg));
    renderApps();
    document.getElementById('hibernateCount').textContent = hibernateApps.length;
  }

  async function removeHibernate(pkg) {
    hibernateApps = hibernateApps.filter(function(a) { return a !== pkg; });
    await writeHibernateList();
    renderApps();
    toast('Un-hibernated ' + (labelCache[pkg] || pkg));
    document.getElementById('hibernateCount').textContent = hibernateApps.length;
  }

  async function writeHibernateList() {
    var lines = ['# KernelKeep — Hibernate List', '# Apps here have background activity blocked', ''];
    lines.push.apply(lines, hibernateApps);
    await exec("cat > '" + HIBERNATE_PATH + "' <<'EOF'\n" + lines.join('\n') + "\nEOF", 5000);
  }

  // ═══ Logs ═══
  async function loadLogs() {
    try {
      var res = await exec('tail -50 "' + LOG_PATH + '" 2>/dev/null || echo "No logs yet. Reboot to generate."', 5000);
      document.getElementById('logView').textContent = res.stdout || 'Log is empty.';
    } catch (e) {
      document.getElementById('logView').textContent = 'Error: ' + e.message;
    }
  }

  document.getElementById('btnClearLog').addEventListener('click', async function() {
    await exec('> "' + LOG_PATH + '"');
    loadLogs();
    toast('Logs cleared');
  });

  // ═══ Search & filter ═══
  document.getElementById('appSearch').addEventListener('input', function() {
    if (document.getElementById('page-apps').classList.contains('active')) renderApps();
  });

  document.getElementById('chipUser').addEventListener('click', function() {
    document.querySelectorAll('.chip').forEach(function(c) { c.classList.remove('active'); });
    this.classList.add('active');
    currentFilter = 'user';
    renderApps();
  });
  document.getElementById('chipSystem').addEventListener('click', function() {
    document.querySelectorAll('.chip').forEach(function(c) { c.classList.remove('active'); });
    this.classList.add('active');
    currentFilter = 'system';
    renderApps();
  });
  document.getElementById('chipAll').addEventListener('click', function() {
    document.querySelectorAll('.chip').forEach(function(c) { c.classList.remove('active'); });
    this.classList.add('active');
    currentFilter = 'all';
    renderApps();
  });

  document.getElementById('savedList').addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action="remove"]');
    if (!btn) return;
    var pkg = btn.getAttribute('data-pkg');
    if (pkg) removeApp(pkg);
  });

  document.getElementById('appsList').addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action="add"]');
    if (!btn) return;
    var pkg = btn.getAttribute('data-pkg');
    if (pkg) addApp(pkg);
  });

  // ═══ Stats page ═══
  document.getElementById('refreshStats').addEventListener('click', function() {
    loadStats();
    loadKillHistory();
    toast('Stats refreshed');
  });

  document.getElementById('verifyBtn').addEventListener('click', verifyApps);
  document.getElementById('exportBtn').addEventListener('click', exportConfig);
  document.getElementById('importBtn').addEventListener('click', importConfig);

  // ═══ Init ═══
  document.addEventListener('DOMContentLoaded', async function() {
    try {
      await loadDeviceInfo();
      await loadSavedApps();
      await loadInstalledApps();
      await loadHibernateApps();
      await loadStats();
      await loadKillHistory();
      renderSaved();
      renderApps();
    } catch (e) {
      console.error('Init error:', e);
    }
  });
})();
