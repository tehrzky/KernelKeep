// KernelKeep - FINAL WORKING VERSION (No Icons, No Labels)
(function() {
  'use strict';

  const LIST_PATH = '/data/adb/kernelkeep/apps.list';
  const LOG_PATH  = '/data/adb/kernelkeep/kernelkeep.log';

  let savedApps = [];
  let allApps   = [];
  let currentFilter = 'all';

  // ═══ EXEC WRAPPER (working global callback) ═══
  function exec(cmd) {
    return new Promise(function(resolve) {
      if (typeof ksu === 'undefined' || typeof ksu.exec !== 'function') {
        resolve({ errno: -1, stdout: '', stderr: 'ksu.exec not available' });
        return;
      }
      const name = 'ksu_cb_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
      window[name] = function(errno, stdout, stderr) {
        delete window[name];
        resolve({ errno: errno, stdout: stdout || '', stderr: stderr || '' });
      };
      try {
        ksu.exec(cmd, '{}', name);
      } catch (e) {
        delete window[name];
        resolve({ errno: -1, stdout: '', stderr: String(e) });
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
      var manuf  = (await exec("getprop ro.product.manufacturer")).stdout.trim();
      var model  = (await exec("getprop ro.product.model")).stdout.trim();
      var android = (await exec("getprop ro.build.version.release")).stdout.trim();
      var sdk    = (await exec("getprop ro.build.version.sdk")).stdout.trim();
      var kernel = (await exec("uname -r")).stdout.trim();
      var arch   = (await exec("getprop ro.product.cpu.abi")).stdout.trim();

      document.getElementById('infoDevice').textContent = (manuf || 'Unknown') + ' ' + (model || '');
      document.getElementById('infoAndroid').textContent = 'API ' + (sdk || '?') + ' (' + (android || 'Unknown') + ')';
      document.getElementById('infoOEM').textContent = manuf || 'Unknown';
      document.getElementById('infoKernel').textContent = kernel || 'Unknown';
      document.getElementById('statusMeta').textContent = 'Version 2.1.0 (' + (arch || 'Unknown') + ')';
    } catch (e) {
      console.error('loadDeviceInfo error:', e);
    }
  }

  // ═══ Data loading ═══
  async function loadSavedApps() {
    try {
      var res = await exec('cat "' + LIST_PATH + '" 2>/dev/null');
      savedApps = res.stdout.split('\n').map(function(l){ return l.trim(); }).filter(function(l){ return l && !l.startsWith('#'); });
      document.getElementById('savedCount').textContent = savedApps.length;
      document.getElementById('protectedCount').textContent = savedApps.length;
    } catch (e) {
      console.error('loadSavedApps error:', e);
    }
  }

  async function loadInstalledApps() {
    try {
      var u = await exec("pm list packages -3");
      var s = await exec("pm list packages -s");
      var up = u.stdout.split('\n').map(function(l){ return l.replace('package:', '').trim(); }).filter(Boolean);
      var sp = s.stdout.split('\n').map(function(l){ return l.replace('package:', '').trim(); }).filter(Boolean);
      allApps = [];
      up.forEach(function(p){ allApps.push({pkg: p, type: 'user'}); });
      sp.forEach(function(p){ allApps.push({pkg: p, type: 'system'}); });
      allApps.sort(function(a,b){ return a.pkg.localeCompare(b.pkg); });
      document.getElementById('installedCount').textContent = allApps.length;
      document.getElementById('appsCount').textContent = allApps.length;
    } catch (e) {
      console.error('loadInstalledApps error:', e);
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
      html += '<div class="app-row" data-pkg="' + pkg + '">' +
        '<div class="app-meta">' +
          '<div class="app-name">' + pkg + '</div>' +
          '<div class="app-pkg">' + pkg + '</div>' +
        '</div>' +
        '<button class="btn-pill remove" data-action="remove" data-pkg="' + pkg + '">Remove</button>' +
      '</div>';
    }
    container.innerHTML = html;
  }

  function renderApps() {
    var container = document.getElementById('appsList');
    if (!container) return;
    var q = document.getElementById('appSearch').value.trim().toLowerCase();
    var filtered = allApps.filter(function(a){
      if (currentFilter !== 'all' && a.type !== currentFilter) return false;
      if (q && !a.pkg.toLowerCase().includes(q)) return false;
      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-title">No apps found</div></div>';
      return;
    }

    var html = '';
    for (var i = 0; i < filtered.length; i++) {
      var app = filtered[i];
      var isSaved = savedApps.includes(app.pkg);
      var btnClass = isSaved ? 'saved' : 'add';
      var btnText  = isSaved ? 'Saved' : 'Add';
      html += '<div class="app-row" data-pkg="' + app.pkg + '">' +
        '<div class="app-meta">' +
          '<div class="app-name">' + app.pkg + '</div>' +
          '<div class="app-pkg">' + app.pkg + '</div>' +
          '<div class="app-badges"><span class="badge ' + (app.type === 'user' ? 'green' : 'orange') + '">' + app.type + '</span></div>' +
        '</div>' +
        '<button class="btn-pill ' + btnClass + '" data-action="add" data-pkg="' + app.pkg + '">' + btnText + '</button>' +
      '</div>';
    }
    container.innerHTML = html;
  }

  // ═══ Add/Remove ═══
  async function addApp(pkg) {
    if (savedApps.includes(pkg)) { toast('Already saved'); return; }
    savedApps.push(pkg);
    await writeList();
    toast('Added ' + pkg);
    renderApps();
    renderSaved();
    document.getElementById('savedCount').textContent = savedApps.length;
    document.getElementById('protectedCount').textContent = savedApps.length;
  }

  async function removeApp(pkg) {
    savedApps = savedApps.filter(function(a){ return a !== pkg; });
    await writeList();
    renderSaved();
    renderApps();
    toast('Removed ' + pkg);
    document.getElementById('savedCount').textContent = savedApps.length;
    document.getElementById('protectedCount').textContent = savedApps.length;
  }

  async function writeList() {
    var lines = ['# KernelKeep — one package per line', '# Lines starting with # are ignored', ''];
    lines.push.apply(lines, savedApps);
    await exec("cat > '" + LIST_PATH + "' <<'EOF'\n" + lines.join('\n') + "\nEOF");
  }

  // ═══ Logs ═══
  async function loadLogs() {
    try {
      var res = await exec('cat "' + LOG_PATH + '" 2>/dev/null || echo "No logs yet. Reboot to generate."');
      document.getElementById('logView').textContent = res.stdout || 'Log is empty.';
    } catch (e) {
      console.error('loadLogs error:', e);
    }
  }

  document.getElementById('btnClearLog').addEventListener('click', async function() {
    await exec('> "' + LOG_PATH + '"');
    loadLogs();
    toast('Logs cleared');
  });

  // ═══ Search & filter ═══
  document.getElementById('appSearch').addEventListener('input', function(){
    if (document.getElementById('page-apps').classList.contains('active')) renderApps();
  });

  document.getElementById('chipUser').addEventListener('click', function() {
    document.querySelectorAll('.chip').forEach(function(c){ c.classList.remove('active'); });
    this.classList.add('active');
    currentFilter = 'user';
    renderApps();
  });
  document.getElementById('chipSystem').addEventListener('click', function() {
    document.querySelectorAll('.chip').forEach(function(c){ c.classList.remove('active'); });
    this.classList.add('active');
    currentFilter = 'system';
    renderApps();
  });
  document.getElementById('chipAll').addEventListener('click', function() {
    document.querySelectorAll('.chip').forEach(function(c){ c.classList.remove('active'); });
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

  // ═══ Init ═══
  document.addEventListener('DOMContentLoaded', async function() {
    try {
      await loadDeviceInfo();
      await loadSavedApps();
      await loadInstalledApps();
      renderSaved();
      renderApps();
    } catch (e) {
      console.error('Init error:', e);
    }
  });
})();
