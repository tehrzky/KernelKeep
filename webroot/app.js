// KernelKeep — Safety-First WebUI v2.2.0
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
  let currentAppTab = 'protected';
  let labelCache = {};
  let iconCache = {};
  let stats = {};
  let killHistory = [];

  // ═══ SYSTEM SAFELIST — NEVER HIBERNATE THESE ═══
  const SYSTEM_SAFELIST = [
    'com.android.systemui',
    'com.android.phone',
    'com.android.settings',
    'com.android.inputmethod',
    'com.android.launcher',
    'com.android.providers.settings',
    'com.android.providers.media',
    'com.android.providers.downloads',
    'com.android.packageinstaller',
    'com.android.permissioncontroller',
    'com.android.networkstack',
    'com.android.wifi',
    'com.android.bluetooth',
    'com.android.nfc',
    'com.android.location',
    'com.android.server',
    'com.android.telephony',
    'com.android.keyguard',
    'com.google.android.gms',
    'com.google.android.gsf',
    'com.google.android.play.games',
    'com.google.android.apps.maps',
    'com.google.android.apps.nexuslauncher',
    'com.google.android.apps.messaging',
    'com.android.vending',
    'com.google.android.setupwizard',
    'com.android.incallui',
    'com.android.dialer',
    'com.android.messaging',
    'com.android.calculator',
    'com.android.calendar',
    'com.android.contacts',
    'com.android.gallery',
    'com.android.camera',
    'com.android.clock'
  ];

  function isSystemApp(pkg) {
    return SYSTEM_SAFELIST.includes(pkg);
  }

  function isSafeToHibernate(pkg) {
    return !isSystemApp(pkg);
  }

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

  // ═══ NAVIGATION ═══
  function switchTab(page) {
    var items = document.querySelectorAll('.nav-item');
    for (var i = 0; i < items.length; i++) items[i].classList.remove('active');
    var pages = document.querySelectorAll('.page');
    for (var i = 0; i < pages.length; i++) pages[i].classList.remove('active');

    var btnMap = { home: 'navHome', apps: 'navApps', settings: 'navSettings' };
    var btn = document.getElementById(btnMap[page]);
    if (btn) btn.classList.add('active');
    var pageEl = document.getElementById('page-' + page);
    if (pageEl) pageEl.classList.add('active');
    
    if (page === 'settings') {
      loadLogs();
      loadBootCount();
      loadSafeModeStatus();
      loadScheduleStatus();
      loadBatchSize();
    }
  }

  document.getElementById('navHome').addEventListener('click', function() { switchTab('home'); });
  document.getElementById('navApps').addEventListener('click', function() { switchTab('apps'); });
  document.getElementById('navSettings').addEventListener('click', function() { switchTab('settings'); });

  // ═══ APP TABS ═══
  document.getElementById('tabProtected').addEventListener('click', function() {
    setAppTab('protected');
  });
  document.getElementById('tabHibernated').addEventListener('click', function() {
    setAppTab('hibernated');
  });
  document.getElementById('tabAll').addEventListener('click', function() {
    setAppTab('all');
  });

  function setAppTab(tab) {
    currentAppTab = tab;
    document.querySelectorAll('.app-tab').forEach(function(t) { t.classList.remove('active'); });
    if (tab === 'protected') document.getElementById('tabProtected').classList.add('active');
    else if (tab === 'hibernated') document.getElementById('tabHibernated').classList.add('active');
    else if (tab === 'all') document.getElementById('tabAll').classList.add('active');
    renderApps();
  }

  // ═══ DEVICE INFO ═══
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
      document.getElementById('statusMeta').textContent = 'v2.2.0 (' + (arch || 'Unknown') + ')';
    } catch (e) {
      console.warn('Device info partial', e);
    }
  }

  // ═══ GET INSTALLED APPS ═══
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

  // ═══ LOAD SAVED APPS ═══
  async function loadSavedApps() {
    try {
      var res = await exec('cat "' + LIST_PATH + '" 2>/dev/null', 3000);
      savedApps = res.stdout.split('\n').map(function(l) { return l.trim(); }).filter(function(l) { return l && !l.startsWith('#'); });
      document.getElementById('savedCount').textContent = savedApps.length;
      document.getElementById('protectedCount').textContent = savedApps.length;
      document.getElementById('tabProtectedCount').textContent = savedApps.length;
    } catch (e) {
      console.warn('loadSavedApps error:', e);
    }
  }

  // ═══ LOAD HIBERNATE APPS (with safety filter) ═══
  async function loadHibernateApps() {
    try {
      var res = await exec('cat "' + HIBERNATE_PATH + '" 2>/dev/null', 3000);
      var raw = res.stdout.split('\n').map(function(l) { return l.trim(); }).filter(function(l) { return l && !l.startsWith('#'); });
      // SAFETY: Remove any system apps from the list
      hibernateApps = raw.filter(function(pkg) {
        if (isSystemApp(pkg)) {
          console.warn('⛔ Removing system app from hibernate list:', pkg);
          return false;
        }
        return true;
      });
      // If any system apps were removed, update the file
      if (hibernateApps.length !== raw.length) {
        await writeHibernateList();
      }
      document.getElementById('hibernateCount').textContent = hibernateApps.length;
      document.getElementById('hibernateCountHome').textContent = hibernateApps.length;
      document.getElementById('tabHibernatedCount').textContent = hibernateApps.length;
    } catch (e) {
      console.warn('loadHibernateApps error:', e);
    }
  }

  // ═══ LOAD STATS ═══
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

  // ═══ LOAD KILL HISTORY ═══
  async function loadKillHistory() {
    try {
      var res = await exec('tail -20 "' + KILL_HISTORY + '" 2>/dev/null', 3000);
      document.getElementById('killHistoryView').textContent = res.stdout || 'No kills recorded yet.';
    } catch (e) {
      document.getElementById('killHistoryView').textContent = 'Error loading history.';
    }
  }

  // ═══ LABEL & ICON FETCHING ═══
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

  // ═══ RENDER FUNCTIONS ═══
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

  // ═══ MAIN RENDER APPS (with safety filters) ═══
  function renderApps() {
    var container = document.getElementById('appsListContainer');
    if (!container) return;
    
    var q = document.getElementById('appSearch').value.trim().toLowerCase();
    var filtered = allApps.filter(function(a) {
      if (q) {
        var label = (labelCache[a.pkg] || a.pkg).toLowerCase();
        return a.pkg.toLowerCase().includes(q) || label.includes(q);
      }
      return true;
    });

    // Apply tab filter
    if (currentAppTab === 'protected') {
      filtered = filtered.filter(function(a) { return savedApps.includes(a.pkg); });
    } else if (currentAppTab === 'hibernated') {
      // SAFETY: Only show apps that can be hibernated (hide system apps)
      filtered = filtered.filter(function(a) { 
        return hibernateApps.includes(a.pkg) && isSafeToHibernate(a.pkg);
      });
    }

    // Apply chip filter
    if (currentFilter !== 'all') {
      filtered = filtered.filter(function(a) { return a.type === currentFilter; });
    }

    if (filtered.length === 0) {
      if (currentAppTab === 'hibernated' && hibernateApps.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-title">No hibernated apps</div><div>Hibernate an app from the All Apps tab</div></div>';
      } else if (currentAppTab === 'hibernated' && hibernateApps.length > 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-title">System apps hidden</div><div>System apps cannot be hibernated for safety</div></div>';
      } else {
        container.innerHTML = '<div class="empty-state"><div class="empty-title">No apps found</div><div>Try a different filter</div></div>';
      }
      return;
    }

    var html = '';
    for (var i = 0; i < filtered.length; i++) {
      var app = filtered[i];
      var pkg = app.pkg;
      var isSaved = savedApps.includes(pkg);
      var isHibernated = hibernateApps.includes(pkg);
      var isSystem = isSystemApp(pkg);
      var label = labelCache[pkg] || pkg;
      var sid = pkg.replace(/[^a-zA-Z0-9]/g, '-');
      
      var badges = '<span class="badge ' + (app.type === 'user' ? 'green' : 'orange') + '">' + app.type + '</span>';
      if (isSystem) badges += ' <span class="badge red">System</span>';
      if (isHibernated) badges += ' <span class="badge" style="background:var(--orange-dim);color:var(--orange);">💤</span>';
      
      var buttons = '';
      // SAFETY: System apps get NO hibernation buttons
      if (isSystem) {
        if (isSaved) {
          buttons = '<button class="btn-pill saved" data-action="remove" data-pkg="' + pkg + '">Remove</button>';
        } else {
          buttons = '<button class="btn-pill add" data-action="add" data-pkg="' + pkg + '">Protect</button>';
        }
        // System apps: no hibernation button
      } else {
        // User apps: full controls
        if (!isSaved && !isHibernated) {
          buttons = '<button class="btn-pill add" data-action="add" data-pkg="' + pkg + '">Protect</button>' +
                    '<button class="btn-pill" style="background:var(--orange-dim);color:var(--orange);" data-action="hibernate" data-pkg="' + pkg + '">💤</button>';
        } else if (isSaved && !isHibernated) {
          buttons = '<button class="btn-pill saved" data-action="remove" data-pkg="' + pkg + '">Remove</button>' +
                    '<button class="btn-pill" style="background:var(--orange-dim);color:var(--orange);" data-action="hibernate" data-pkg="' + pkg + '">💤</button>';
        } else if (!isSaved && isHibernated) {
          buttons = '<button class="btn-pill add" data-action="add" data-pkg="' + pkg + '">Protect</button>' +
                    '<button class="btn-pill" style="background:var(--red-dim);color:var(--red);" data-action="unhibernate" data-pkg="' + pkg + '">💤 Remove</button>';
        } else {
          buttons = '<button class="btn-pill saved" data-action="remove" data-pkg="' + pkg + '">Remove</button>' +
                    '<button class="btn-pill" style="background:var(--red-dim);color:var(--red);" data-action="unhibernate" data-pkg="' + pkg + '">💤 Remove</button>';
        }
      }

      html += '<div class="app-row" data-pkg="' + pkg + '">' +
        '<div class="app-icon" id="ai-' + sid + '">' +
          '<span style="display:flex;align-items:center;justify-content:center;width:48px;height:48px;background:#333;color:#fff;font-size:20px;font-weight:700;border-radius:12px;">?</span>' +
        '</div>' +
        '<div class="app-meta">' +
          '<div class="app-name" id="al-' + sid + '">' + label + '</div>' +
          '<div class="app-pkg">' + pkg + '</div>' +
          '<div class="app-badges">' + badges + '</div>' +
        '</div>' +
        '<div style="display:flex;gap:4px;flex-shrink:0;">' + buttons + '</div>' +
      '</div>';
    }
    container.innerHTML = html;
    
    // Load icons and labels
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
  
    // ═══ ADD/REMOVE ═══
  async function addApp(pkg) {
    if (savedApps.includes(pkg)) { toast('Already saved'); return; }
    savedApps.push(pkg);
    await writeList();
    toast('Added ' + (labelCache[pkg] || pkg));
    renderApps();
    renderSaved();
    document.getElementById('savedCount').textContent = savedApps.length;
    document.getElementById('protectedCount').textContent = savedApps.length;
    document.getElementById('tabProtectedCount').textContent = savedApps.length;
  }

  async function removeApp(pkg) {
    savedApps = savedApps.filter(function(a) { return a !== pkg; });
    await writeList();
    renderSaved();
    renderApps();
    toast('Removed ' + (labelCache[pkg] || pkg));
    document.getElementById('savedCount').textContent = savedApps.length;
    document.getElementById('protectedCount').textContent = savedApps.length;
    document.getElementById('tabProtectedCount').textContent = savedApps.length;
  }

  async function writeList() {
    var lines = ['# KernelKeep — one package per line', '# Lines starting with # are ignored', ''];
    lines.push.apply(lines, savedApps);
    await exec("cat > '" + LIST_PATH + "' <<'EOF'\n" + lines.join('\n') + "\nEOF", 5000);
  }

  // ═══ HIBERNATE FUNCTIONS (with safety) ═══
  async function addHibernate(pkg) {
    // SAFETY: Block system apps
    if (isSystemApp(pkg)) {
      toast('⛔ System apps cannot be hibernated for safety');
      return;
    }
    if (hibernateApps.includes(pkg)) { toast('Already hibernated'); return; }
    hibernateApps.push(pkg);
    await writeHibernateList();
    toast('💤 Hibernated ' + (labelCache[pkg] || pkg));
    document.getElementById('hibernateCount').textContent = hibernateApps.length;
    document.getElementById('hibernateCountHome').textContent = hibernateApps.length;
    document.getElementById('tabHibernatedCount').textContent = hibernateApps.length;
    renderApps();
  }

  async function removeHibernate(pkg) {
    hibernateApps = hibernateApps.filter(function(a) { return a !== pkg; });
    await writeHibernateList();
    toast('Un-hibernated ' + (labelCache[pkg] || pkg));
    document.getElementById('hibernateCount').textContent = hibernateApps.length;
    document.getElementById('hibernateCountHome').textContent = hibernateApps.length;
    document.getElementById('tabHibernatedCount').textContent = hibernateApps.length;
    renderApps();
  }

  async function writeHibernateList() {
    // SAFETY: Filter out any system apps before writing
    var safeList = hibernateApps.filter(function(pkg) {
      if (isSystemApp(pkg)) {
        console.warn('⛔ Removing system app from hibernate list before save:', pkg);
        return false;
      }
      return true;
    });
    // Update the in-memory list to match the safe list
    if (safeList.length !== hibernateApps.length) {
      hibernateApps = safeList;
    }
    var lines = ['# KernelKeep — Hibernate List', '# SAFETY: System apps are automatically removed from this list', ''];
    lines.push.apply(lines, hibernateApps);
    await exec("cat > '" + HIBERNATE_PATH + "' <<'EOF'\n" + lines.join('\n') + "\nEOF", 5000);
  }

  // ═══ VERIFICATION ═══
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

  // ═══ EXPORT/IMPORT ═══
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

  // ═══ SETTINGS FUNCTIONS ═══
  async function loadBootCount() {
    try {
      var res = await exec('cat /data/adb/kernelkeep/boot_count 2>/dev/null || echo 0', 2000);
      document.getElementById('bootCountDisplay').textContent = res.stdout.trim() || '0';
    } catch (e) {
      document.getElementById('bootCountDisplay').textContent = '?';
    }
  }

  async function loadSafeModeStatus() {
    try {
      var res = await exec('test -f /data/adb/kernelkeep/safe_mode && echo "Enabled" || echo "Disabled"', 2000);
      var status = res.stdout.trim();
      document.getElementById('safeModeStatus').textContent = status;
      document.getElementById('safeModeStatus').style.color = status === 'Enabled' ? 'var(--red)' : 'var(--green)';
    } catch (e) {
      document.getElementById('safeModeStatus').textContent = 'Unknown';
    }
  }

  async function loadScheduleStatus() {
    try {
      var res = await exec('cat /data/adb/kernelkeep/schedule_interval 2>/dev/null || echo "21600"', 2000);
      var val = res.stdout.trim();
      var select = document.getElementById('scheduleInterval');
      for (var i = 0; i < select.options.length; i++) {
        if (select.options[i].value === val) {
          select.selectedIndex = i;
          break;
        }
      }
      document.getElementById('scheduleStatus').textContent = 'Current: ' + select.options[select.selectedIndex].text;
    } catch (e) {}
  }

  async function loadBatchSize() {
    try {
      var res = await exec('cat /data/adb/kernelkeep/batch_size 2>/dev/null || echo "3"', 2000);
      var val = res.stdout.trim();
      var select = document.getElementById('batchSizeSelect');
      for (var i = 0; i < select.options.length; i++) {
        if (select.options[i].value === val) {
          select.selectedIndex = i;
          break;
        }
      }
    } catch (e) {}
  }

  // ═══ SETTINGS EVENT BINDINGS ═══
  document.getElementById('resetBootCountBtn').addEventListener('click', async function() {
    await exec('echo "0" > /data/adb/kernelkeep/boot_count', 3000);
    toast('Boot count reset');
    loadBootCount();
  });

  document.getElementById('enableSafeModeBtn').addEventListener('click', async function() {
    await exec('touch /data/adb/kernelkeep/safe_mode', 3000);
    toast('Safe mode enabled. Reboot to apply.');
    loadSafeModeStatus();
  });

  document.getElementById('applyScheduleBtn').addEventListener('click', async function() {
    var interval = document.getElementById('scheduleInterval').value;
    await exec('echo "' + interval + '" > /data/adb/kernelkeep/schedule_interval', 3000);
    toast('Schedule updated to ' + document.getElementById('scheduleInterval').options[document.getElementById('scheduleInterval').selectedIndex].text);
    document.getElementById('scheduleStatus').textContent = 'Current: ' + document.getElementById('scheduleInterval').options[document.getElementById('scheduleInterval').selectedIndex].text;
  });

  document.getElementById('applyBatchBtn').addEventListener('click', async function() {
    var size = document.getElementById('batchSizeSelect').value;
    await exec('echo "' + size + '" > /data/adb/kernelkeep/batch_size', 3000);
    toast('Batch size updated to ' + size);
  });

  document.getElementById('refreshStats').addEventListener('click', function() {
    loadStats();
    loadKillHistory();
    toast('Stats refreshed');
  });

  document.getElementById('verifyBtn').addEventListener('click', verifyApps);
  document.getElementById('exportBtn').addEventListener('click', exportConfig);
  document.getElementById('importBtn').addEventListener('click', importConfig);

  // ═══ LOGS ═══
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

  // ═══ SEARCH & CHIPS ═══
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

  // ═══ DELEGATED CLICK HANDLERS ═══
  document.getElementById('savedList').addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action="remove"]');
    if (!btn) return;
    var pkg = btn.getAttribute('data-pkg');
    if (pkg) removeApp(pkg);
  });

  document.getElementById('appsListContainer').addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var pkg = btn.getAttribute('data-pkg');
    var action = btn.getAttribute('data-action');
    
    if (action === 'add') addApp(pkg);
    else if (action === 'remove') removeApp(pkg);
    else if (action === 'hibernate') addHibernate(pkg);
    else if (action === 'unhibernate') removeHibernate(pkg);
  });

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
    } catch (e) {
      console.error('Init error:', e);
    }
  });
})();
