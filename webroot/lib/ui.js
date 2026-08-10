// ===== Navigation =====
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

// ===== App tabs =====
let currentAppTab = 'protected';

document.getElementById('tabProtected').addEventListener('click', function() { setAppTab('protected'); });
document.getElementById('tabHibernated').addEventListener('click', function() { setAppTab('hibernated'); });
document.getElementById('tabAll').addEventListener('click', function() { setAppTab('all'); });

function setAppTab(tab) {
  currentAppTab = tab;
  document.querySelectorAll('.app-tab').forEach(function(t) { t.classList.remove('active'); });
  if (tab === 'protected') document.getElementById('tabProtected').classList.add('active');
  else if (tab === 'hibernated') document.getElementById('tabHibernated').classList.add('active');
  else if (tab === 'all') document.getElementById('tabAll').classList.add('active');
  renderApps();
}

// ===== Search & chips =====
document.getElementById('appSearch').addEventListener('input', function() {
  if (document.getElementById('page-apps').classList.contains('active')) renderApps();
});

let currentFilter = 'all';

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

// ===== Delegated click handlers =====
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

// ===== Logs =====
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

// ===== Render functions =====
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

  if (currentAppTab === 'protected') {
    filtered = filtered.filter(function(a) { return savedApps.includes(a.pkg); });
  } else if (currentAppTab === 'hibernated') {
    filtered = filtered.filter(function(a) { 
      return hibernateApps.includes(a.pkg) && isSafeToHibernate(a.pkg);
    });
  }

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
    if (isSystem) {
      buttons = isSaved 
        ? '<button class="btn-pill saved" data-action="remove" data-pkg="' + pkg + '">Remove</button>'
        : '<button class="btn-pill add" data-action="add" data-pkg="' + pkg + '">Protect</button>';
    } else {
      if (!
