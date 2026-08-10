// ===== Protected apps =====
let savedApps = [];

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

async function addApp(pkg) {
  if (savedApps.includes(pkg)) { toast('Already saved'); return; }
  savedApps.push(pkg);
  await writeList();
  toast('Added ' + (labelCache[pkg] || pkg));
  renderApps();
  renderSaved();
  updateCounts();
}

async function removeApp(pkg) {
  savedApps = savedApps.filter(function(a) { return a !== pkg; });
  await writeList();
  renderSaved();
  renderApps();
  toast('Removed ' + (labelCache[pkg] || pkg));
  updateCounts();
}

async function writeList() {
  var lines = ['# KernelKeep — one package per line', '# Lines starting with # are ignored', ''];
  lines.push.apply(lines, savedApps);
  await exec("cat > '" + LIST_PATH + "' <<'EOF'\n" + lines.join('\n') + "\nEOF", 5000);
}

function updateCounts() {
  document.getElementById('savedCount').textContent = savedApps.length;
  document.getElementById('protectedCount').textContent = savedApps.length;
  document.getElementById('tabProtectedCount').textContent = savedApps.length;
}
