// ===== Hibernate apps =====
let hibernateApps = [];

async function loadHibernateApps() {
  try {
    var res = await exec('cat "' + HIBERNATE_PATH + '" 2>/dev/null', 3000);
    var raw = res.stdout.split('\n').map(function(l) { return l.trim(); }).filter(function(l) { return l && !l.startsWith('#'); });
    hibernateApps = raw.filter(function(pkg) {
      if (isSystemApp(pkg)) {
        console.warn('⛔ Removing system app from hibernate list:', pkg);
        return false;
      }
      return true;
    });
    if (hibernateApps.length !== raw.length) {
      await writeHibernateList();
    }
    updateHibernateCounts();
  } catch (e) {
    console.warn('loadHibernateApps error:', e);
  }
}

async function addHibernate(pkg) {
  if (isSystemApp(pkg)) {
    toast('⛔ System apps cannot be hibernated for safety');
    return;
  }
  if (hibernateApps.includes(pkg)) { toast('Already hibernated'); return; }
  hibernateApps.push(pkg);
  await writeHibernateList();
  toast('💤 Hibernated ' + (labelCache[pkg] || pkg));
  updateHibernateCounts();
  renderApps();
}

async function removeHibernate(pkg) {
  hibernateApps = hibernateApps.filter(function(a) { return a !== pkg; });
  await writeHibernateList();
  toast('Un-hibernated ' + (labelCache[pkg] || pkg));
  updateHibernateCounts();
  renderApps();
}

async function writeHibernateList() {
  var safeList = hibernateApps.filter(function(pkg) {
    if (isSystemApp(pkg)) {
      console.warn('⛔ Removing system app from hibernate list before save:', pkg);
      return false;
    }
    return true;
  });
  if (safeList.length !== hibernateApps.length) {
    hibernateApps = safeList;
  }
  var lines = ['# KernelKeep — Hibernate List', '# SAFETY: System apps are automatically removed from this list', ''];
  lines.push.apply(lines, hibernateApps);
  await exec("cat > '" + HIBERNATE_PATH + "' <<'EOF'\n" + lines.join('\n') + "\nEOF", 5000);
}

function updateHibernateCounts() {
  document.getElementById('hibernateCount').textContent = hibernateApps.length;
  document.getElementById('hibernateCountHome').textContent = hibernateApps.length;
  document.getElementById('tabHibernatedCount').textContent = hibernateApps.length;
}
