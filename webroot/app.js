// DKMA Monster WebUI
// Uses legacy ksu.exec() API with callbacks (DeepDoze/AshLooper pattern)

(function() {
  'use strict';

  const LIST_PATH = '/data/adb/dkma/apps.list';
  const LOG_PATH  = '/data/adb/dkma/dkma.log';

  let savedApps = [];
  let allApps   = [];
  let currentFilter = 'all';
  let labelCache = {};
  let iconCache  = {};
  let hasRoot = true;

  // ═══ EXEC WRAPPER (legacy ksu.exec API) ═══
  function exec(cmd) {
    return new Promise(function(resolve) {
      if (typeof ksu === 'undefined' || typeof ksu.exec !== 'function') {
        hasRoot = false;
        resolve({ errno: -1, stdout: '', stderr: 'no root bridge' });
        return;
      }
      const name = 'cb_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
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
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(function() { el.classList.remove('show'); }, dur);
  }

  // ═══ TAB SWITCHING ═══
  function switchTab(page) {
    var items = document.querySelectorAll('.nav-item');
    for (var i = 0; i < items.length; i++) items[i].classList.remove('active');
    var pages = document.querySelectorAll('.page');
    for (var i = 0; i < pages.length; i++) pages[i].classList.remove('active');

    var btnMap = { home: 'navHome', apps: 'navApps', logs: 'navLogs' };
    var btn = document.getElementById(btnMap[page]);
    if (btn) btn.classList.add('active');
    document.getElementById('page-' + page).classList.add('active');
    if (page === 'logs') loadLogs();
  }

  document.getElementById('navHome').addEventListener('click', function() { switchTab('home'); });
  document.getElementById('navApps').addEventListener('click', function() { switchTab('apps'); });
  document.getElementById('navLogs').addEventListener('click', function() { switchTab('logs'); });

  // ═══ DEVICE INFO ═══
  async function loadDeviceInfo() {
    var manuf  = (await exec("getprop ro.product.manufacturer")).out.trim();
    var model  = (await exec("getprop ro.product.model")).out.trim();
    var android = (await exec("getprop ro.build.version.release")).out.trim();
    var sdk    = (await exec("getprop ro.build.version.sdk")).out.trim();
    var kernel = (await exec("uname -r")).out.trim();
    var arch   = (await exec("getprop ro.product.cpu.abi")).out.trim();

    document.getElementById('infoDevice').textContent = manuf + ' ' + model;
    document.getElementById('infoAndroid').textContent = 'API ' + sdk + ' (' + android + ')';
    document.getElementById('infoOEM').textContent = manuf || 'Unknown';
    document.getElementById('infoKernel').textContent = kernel;
    document.getElementById('statusMeta').textContent = 'Version 2.0.0 (' + arch + ')';
  }

  // ═══ LABELS & ICONS ═══
  async function fetchLabel(pkg) {
    if (labelCache[pkg]) return labelCache[pkg];
    var apk = (await exec('pm path "' + pkg + '" 2>/dev/null | head -1 | cut -d: -f2')).out.trim();
    if (!apk) { labelCache[pkg] = pkg; return pkg; }
    var label = (await exec('aapt dump badging "' + apk + '" 2>/dev/null | grep "application-label:" | head -1 | cut -d\' + "'" + ' -f2')).out.trim();
    if (!label) label = pkg;
    labelCache[pkg] = label;
    return label;
  }

  async function fetchIcon(pkg) {
    if (iconCache[pkg]) return iconCache[pkg];
    var apk = (await exec('pm path "' + pkg + '" 2>/dev/null | head -1 | cut -d: -f2')).out.trim();
    if (!apk) return null;
    var paths = (await exec('unzip -l "' + apk + '" 2>/dev/null | grep -E "mipmap-.*ic_launcher\.(png|webp)" | awk '{print $4}' | sort -t- -k2 -r')).out.trim().split('\n').filter(function(p) { return p && !p.endsWith('.xml'); });
    for (var i = 0; i < paths.length; i++) {
      var b64 = (await exec('unzip -p "' + apk + '" "' + paths[i] + '" 2>/dev/null | base64 -w 0')).out.trim();
      if (b64 && b64.length > 100) {
        var uri = 'data:image/' + (paths[i].endsWith('.webp') ? 'webp' : 'png') + ';base64,' + b64;
        iconCache[pkg] = uri;
        return uri;
      }
    }
    return null;
  }

  function fallbackIcon(pkg) {
    var colors = ['#ef4444','#f97316','#eab308','#84cc16','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#d946ef','#f43f5e'];
    var hash = pkg.split('').reduce(function(a,b){ return a + b.charCodeAt(0); }, 0);
    var initial = pkg.replace(/^com\.|^org\.|^net\.|^app\./, '').charAt(0).toUpperCase() || pkg.charAt(0).toUpperCase();
    return { color: colors[hash % colors.length], initial: initial };
  }

  function makeIconHtml(pkg) {
    var cached = iconCache[pkg];
    if (cached) return '<img src="' + cached + '" alt="">';
    var f = fallbackIcon(pkg);
    return '<span style="background:' + f.color + '">' + f.initial + '</span>';
  }

  // ═══ DATA LOADING ═══
  async function loadSavedApps() {
    var res = await exec('cat "' + LIST_PATH + '" 2>/dev/null');
    savedApps = res.out.split('\n').map(function(l){ return l.trim(); }).filter(function(l){ return l && !l.startsWith('#'); });
    document.getElementById('savedCount').textContent = savedApps.length;
    document.getElementById('protectedCount').textContent = savedApps.length;
  }

  async function loadInstalledApps() {
    var u = await exec("pm list packages -3");
    var s = await exec("pm list packages -s");
    var up = u.out.split('\n').map(function(l){ return l.replace('package:', '').trim(); }).filter(Boolean);
    var sp = s.out.split('\n').map(function(l){ return l.replace('package:', '').trim(); }).filter(Boolean);
    allApps = [];
    up.forEach(function(p){ allApps.push({pkg: p, type: 'user'}); });
    sp.forEach(function(p){ allApps.push({pkg: p, type: 'system'}); });
    allApps.sort(function(a,b){ return a.pkg.localeCompare(b.pkg); });
    document.getElementById('installedCount').textContent = allApps.length;
    document.getElementById('appsCount').textContent = allApps.length;
  }

  // ═══ RENDERING ═══
  function safeId(pkg) { return pkg.replace(/[^a-zA-Z0-9]/g, '-'); }

  async function renderSaved() {
    var container = document.getElementById('savedList');
    if (savedApps.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-title">No protected apps</div><div>Add apps from below</div></div>';
      return;
    }
    var html = '';
    for (var i = 0; i < savedApps.length; i++) {
      var pkg = savedApps[i];
      var sid = safeId(pkg);
      html += '<div class="app-row" data-pkg="' + pkg + '">' +
        '<div class="app-icon" id="si-' + sid + '">' + makeIconHtml(pkg) + '</div>' +
        '<div class="app-meta">' +
          '<div class="app-name" id="sl-' + sid + '">' + (labelCache[pkg] || pkg) + '</div>' +
          '<div class="app-pkg">' + pkg + '</div>' +
        '</div>' +
        '<button class="btn-pill remove" data-action="remove" data-pkg="' + pkg + '">Remove</button>' +
      '</div>';
    }
    container.innerHTML = html;

    for (var i = 0; i < savedApps.length; i++) {
      (async function(pkg) {
        var sid = safeId(pkg);
        if (!labelCache[pkg]) {
          var label = await fetchLabel(pkg);
          var el = document.getElementById('sl-' + sid);
          if (el) el.textContent = label;
        }
        if (!iconCache[pkg]) {
          var icon = await fetchIcon(pkg);
          if (icon) {
            var el = document.getElementById('si-' + sid);
            if (el) el.innerHTML = '<img src="' + icon + '" alt="">';
          }
        }
      })(savedApps[i]);
    }
  }

  function renderApps() {
    var container = document.getElementById('appsList');
    var q = document.getElementById('appSearch').value.trim().toLowerCase();
    var filtered = allApps.filter(function(a){
      if (currentFilter !== 'all' && a.type !== currentFilter) return false;
      if (q && !a.pkg.toLowerCase().includes(q) && !(labelCache[a.pkg] || '').toLowerCase().includes(q)) return false;
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
      var sid = safeId(app.pkg);
      html += '<div class="app-row" data-pkg="' + app.pkg + '">' +
        '<div class="app-icon" id="ai-' + sid + '">' + makeIconHtml(app.pkg) + '</div>' +
        '<div class="app-meta">' +
          '<div class="app-name" id="al-' + sid + '">' + (labelCache[app.pkg] || app.pkg) + '</div>' +
          '<div class="app-pkg">' + app.pkg + '</div>' +
          '<div class="app-badges"><span class="badge ' + (app.type === 'user' ? 'green' : 'orange') + '">' + app.type + '</span></div>' +
        '</div>' +
        '<button class="btn-pill ' + btnClass + '" data-action="add" data-pkg="' + app.pkg + '">' + btnText + '</button>' +
      '</div>';
    }
    container.innerHTML = html;

    for (var i = 0; i < filtered.length; i++) {
      (async function(app) {
        var sid = safeId(app.pkg);
        if (!labelCache[app.pkg]) {
          var label = await fetchLabel(app.pkg);
          var el = document.getElementById('al-' + sid);
          if (el) el.textContent = label;
        }
        if (!iconCache[app.pkg]) {
          var icon = await fetchIcon(app.pkg);
          if (icon) {
            var el = document.getElementById('ai-' + sid);
            if (el) el.innerHTML = '<img src="' + icon + '" alt="">';
          }
        }
      })(filtered[i]);
    }
  }

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
    var lines = ['# DKMA Monster — one package per line', '# Lines starting with # are ignored', ''];
    lines.push.apply(lines, savedApps);
    await exec("cat > '" + LIST_PATH + "' <<'EOF'\n" + lines.join('\n') + "\nEOF");
  }

  // ═══ SEARCH & FILTER ═══
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

  // ═══ DELEGATED CLICK HANDLERS FOR ADD/REMOVE ═══
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

  // ═══ LOGS ═══
  async function loadLogs() {
    var res = await exec('cat "' + LOG_PATH + '" 2>/dev/null || echo "No logs yet. Reboot to generate."');
    document.getElementById('logView').textContent = res.out || 'Log is empty.';
  }

  document.getElementById('btnClearLog').addEventListener('click', async function() {
    await exec('> "' + LOG_PATH + '"');
    loadLogs();
    toast('Logs cleared');
  });

  // ═══ INIT ═══
  (async function(){
    await loadDeviceInfo();
    await loadSavedApps();
    await loadInstalledApps();
    renderSaved();
    renderApps();
  })();
})();
