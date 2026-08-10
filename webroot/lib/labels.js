// ===== Labels & Icons =====
let labelCache = {};
let iconCache = {};

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
