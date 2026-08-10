// ===== ksu.exec wrapper =====
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
