#!/system/bin/sh
# KernelKeep — Magisk/KernelSU late_start service. Runs on every boot after the
# system is up, and re-applies keep-alive settings for each listed package.
# Add one package per line to:  /data/adb/kernelkeep/apps.list

MODDIR=${0%/*}
LIST=/data/adb/kernelkeep/apps.list
LOG=/data/adb/kernelkeep/kernelkeep.log

mkdir -p /data/adb/kernelkeep
[ -f "$LIST" ] || {
  cat > "$LIST" <<'EOF'
# KernelKeep — one package name per line. Lines starting with # are ignored.
# Example:
# com.your.app
EOF
}

# Wait until the package manager and appops are ready.
i=0
while [ "$(getprop sys.boot_completed)" != "1" ] && [ $i -lt 60 ]; do
  sleep 2; i=$((i+1))
done
sleep 10

echo "=== KernelKeep boot pass $(date) ===" >> "$LOG"

apply() {
  PKG="$1"
  pm list packages 2>/dev/null | grep -qx "package:$PKG" || {
    echo "  skip (not installed): $PKG" >> "$LOG"; return; }
  dumpsys deviceidle whitelist "+$PKG" >>"$LOG" 2>&1 || echo "  whitelist failed" >>"$LOG"
  am set-standby-bucket "$PKG" active >>"$LOG" 2>&1 || echo "  bucket failed" >>"$LOG"
  for OP in RUN_IN_BACKGROUND START_FOREGROUND WAKE_LOCK AUTO_START BOOT_COMPLETED; do
    cmd appops set "$PKG" "$OP" allow >>"$LOG" 2>&1 || echo "  appops $OP failed" >>"$LOG"
  done
  echo "  applied: $PKG" >> "$LOG"
}

while IFS= read -r line; do
  case "$line" in
    ""|\#*) continue ;;
    *) apply "$(echo "$line" | tr -d '[:space:]')" ;;
  esac
done < "$LIST"

echo "=== KernelKeep pass complete ===" >> "$LOG"
