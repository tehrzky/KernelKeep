// ===== Device info =====
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
