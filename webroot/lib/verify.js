// ===== Verification =====
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
