#!/system/bin/sh
# DKMA Monster — Magisk late_start service. Runs on every boot after the
# system is up, and re-applies keep-alive settings for each listed package.
# Add one package per line to:  /data/adb/dkma/apps.list

MODDIR=${0%/*}
LIST=/data/adb/dkma/apps.list
LOG=/data/adb/dkma/dkma.log

mkdir -p /data/adb/dkma
[ -f "$LIST" ] || {
  cat > "$LIST" <<'EOF'
# DKMA Monster — one package name per line. Lines starting with # are ignored.
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

echo "=== DKMA Monster boot pass $(date) ===" >> "$LOG"

apply() {
  PKG="$1"
  pm list packages 2>/dev/null | grep -qx "package:$PKG" || {
    echo "  skip (not installed): $PKG" >> "$LOG"; return; }
  dumpsys deviceidle whitelist "+$PKG" >/dev/null 2>&1
  am set-standby-bucket "$PKG" active   >/dev/null 2>&1
  for OP in RUN_IN_BACKGROUND RUN_ANY_IN_BACKGROUND START_FOREGROUND \
            WAKE_LOCK AUTO_START BOOT_COMPLETED; do
    cmd appops set "$PKG" "$OP" allow >/dev/null 2>&1
  done
  echo "  applied: $PKG" >> "$LOG"
}

while IFS= read -r line; do
  case "$line" in
    ""|\#*) continue ;;
    *) apply "$(echo "$line" | tr -d '[:space:]')" ;;
  esac
done < "$LIST"

echo "=== DKMA Monster pass complete ===" >> "$LOG"
