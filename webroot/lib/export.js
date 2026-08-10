// ===== Export/Import =====
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
