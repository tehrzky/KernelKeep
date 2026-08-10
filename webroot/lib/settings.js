// ===== Settings =====
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

// ===== Settings button bindings =====
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
  toast('Schedule updated');
  loadScheduleStatus();
});

document.getElementById('applyBatchBtn').addEventListener('click', async function() {
  var size = document.getElementById('batchSizeSelect').value;
  await exec('echo "' + size + '" > /data/adb/kernelkeep/batch_size', 3000);
  toast('Batch size updated to ' + size);
});
