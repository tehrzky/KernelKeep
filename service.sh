#!/system/bin/sh
# KernelKeep — Magisk/KernelSU late_start service.
# Runs on every boot and re-applies keep-alive settings.

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

# Wait until system is ready
i=0
while [ "$(getprop sys.boot_completed)" != "1" ] && [ $i -lt 60 ]; do
  sleep 2; i=$((i+1))
done
sleep 10

echo "=== KernelKeep boot pass $(date) ===" >> "$LOG"

# Detect appops command
if command -v cmd >/dev/null 2>&1; then
  APPOPS_CMD="cmd appops"
else
  APPOPS_CMD="appops"
fi
echo "  Using appops: $APPOPS_CMD" >> "$LOG"

apply() {
  PKG="$1"
  pm list packages 2>/dev/null | grep -qx "package:$PKG" || {
    echo "  skip (not installed): $PKG" >> "$LOG"
    return 1
  }
  
  dumpsys deviceidle whitelist "+$PKG" >>"$LOG" 2>&1 || echo "  whitelist failed" >>"$LOG"
  am set-standby-bucket "$PKG" active >>"$LOG" 2>&1 || echo "  bucket failed" >>"$LOG"
  
  for OP in RUN_IN_BACKGROUND START_FOREGROUND WAKE_LOCK AUTO_START BOOT_COMPLETED; do
    $APPOPS_CMD set "$PKG" "$OP" allow >>"$LOG" 2>&1 || echo "  appops $OP failed" >>"$LOG"
  done
  
  echo "  applied: $PKG" >> "$LOG"
  return 0
}

# Apply to all listed packages
while IFS= read -r line; do
  case "$line" in
    ""|\#*) continue ;;
    *) apply "$(echo "$line" | tr -d '[:space:]')" ;;
  esac
done < "$LIST"

# Verification - check first 3 apps
echo "=== Verification ===" >> "$LOG"
head -3 "$LIST" | grep -v '^#' | while read -r PKG; do
  PKG=$(echo "$PKG" | tr -d '[:space:]')
  [ -z "$PKG" ] && continue
  dumpsys deviceidle whitelist | grep -q "$PKG" && echo "  $PKG: whitelisted ✓" >> "$LOG" || echo "  $PKG: NOT whitelisted ✗" >> "$LOG"
done

echo "=== KernelKeep pass complete ===" >> "$LOG"
