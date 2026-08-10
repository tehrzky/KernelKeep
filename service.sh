#!/system/bin/sh
# KernelKeep — Magisk/KernelSU late_start service.
# With: Batch processing, Schedule re-apply, Hibernate list, Kill tracking.

MODDIR=${0%/*}
LIST=/data/adb/kernelkeep/apps.list
LOG=/data/adb/kernelkeep/kernelkeep.log
HIBERNATE_LIST=/data/adb/kernelkeep/hibernate.list
KILL_HISTORY=/data/adb/kernelkeep/kill_history.log
STATS=/data/adb/kernelkeep/stats.json

mkdir -p /data/adb/kernelkeep

# Create default files if missing
[ -f "$LIST" ] || {
  cat > "$LIST" <<'EOF'
# KernelKeep — one package per line. Lines starting with # are ignored.
# Example:
# com.your.app
EOF
}

[ -f "$HIBERNATE_LIST" ] || {
  cat > "$HIBERNATE_LIST" <<'EOF'
# KernelKeep — Hibernate List
# Apps here will have their background activity blocked.
# Icon stays on launcher, app only runs when opened.
# Example:
# com.facebook.katana
# com.twitter.android
EOF
}

[ -f "$STATS" ] || echo '{"total_applied":0,"failed":0,"last_run":""}' > "$STATS"

# Detect appops command
if command -v cmd >/dev/null 2>&1; then
  APPOPS_CMD="cmd appops"
else
  APPOPS_CMD="appops"
fi

# Wait until system is ready
i=0
while [ "$(getprop sys.boot_completed)" != "1" ] && [ $i -lt 60 ]; do
  sleep 2; i=$((i+1))
done
sleep 10

echo "=== KernelKeep boot pass $(date) ===" >> "$LOG"
echo "  Using appops: $APPOPS_CMD" >> "$LOG"

# ═══ BATCH PROCESSING — Process apps in batches of 5 ═══
apply_app() {
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

# Process apps in batches
process_batch() {
  local batch=()
  local count=0
  while IFS= read -r line; do
    case "$line" in
      ""|\#*) continue ;;
      *)
        PKG=$(echo "$line" | tr -d '[:space:]')
        batch+=("$PKG")
        count=$((count+1))
        if [ $count -ge 5 ]; then
          # Process this batch in parallel
          for p in "${batch[@]}"; do
            apply_app "$p" &
          done
          wait
          batch=()
          count=0
        fi
        ;;
    esac
  done < "$LIST"
  # Process remaining
  for p in "${batch[@]}"; do
    apply_app "$p" &
  done
  wait
}

# ═══ HIBERNATE LIST — Block background activity ═══
hibernate_app() {
  PKG="$1"
  pm list packages 2>/dev/null | grep -qx "package:$PKG" || {
    echo "  hibernate skip (not installed): $PKG" >> "$LOG"
    return
  }
  
  # Block ALL background permissions
  $APPOPS_CMD set "$PKG" RUN_IN_BACKGROUND ignore >>"$LOG" 2>&1
  $APPOPS_CMD set "$PKG" WAKE_LOCK ignore >>"$LOG" 2>&1
  $APPOPS_CMD set "$PKG" START_FOREGROUND ignore >>"$LOG" 2>&1
  $APPOPS_CMD set "$PKG" AUTO_START ignore >>"$LOG" 2>&1
  $APPOPS_CMD set "$PKG" BOOT_COMPLETED ignore >>"$LOG" 2>&1
  
  # Force stop once (only on boot, not repeatedly)
  am force-stop "$PKG" >>"$LOG" 2>&1
  
  echo "  hibernated: $PKG (icon stays)" >> "$LOG"
}

# ═══ KILL TRACKING — Monitor for kills ═══
track_kills() {
  # Check if any protected apps were killed
  while IFS= read -r line; do
    case "$line" in
      ""|\#*) continue ;;
      *)
        PKG=$(echo "$line" | tr -d '[:space:]')
        # Check if app is running
        if ! pgrep -f "$PKG" >/dev/null 2>&1; then
          echo "$(date): $PKG was killed" >> "$KILL_HISTORY"
        fi
        ;;
    esac
  done < "$LIST"
}

# ═══ SCHEDULE RE-APPLY (Cron) — Every 6 hours ═══
schedule_reapply() {
  while true; do
    sleep 21600  # 6 hours
    echo "=== Scheduled re-apply $(date) ===" >> "$LOG"
    process_batch
    # Also re-apply hibernation
    while IFS= read -r line; do
      case "$line" in
        ""|\#*) continue ;;
        *) hibernate_app "$(echo "$line" | tr -d '[:space:]')" ;;
      esac
    done < "$HIBERNATE_LIST"
    echo "=== Scheduled re-apply complete ===" >> "$LOG"
    track_kills
  done &
}

# ═══ MAIN EXECUTION ═══

# 1. Process protected apps (batch)
echo "=== Processing protected apps (batch) ===" >> "$LOG"
process_batch

# 2. Process hibernation list
echo "=== Processing hibernation list ===" >> "$LOG"
while IFS= read -r line; do
  case "$line" in
    ""|\#*) continue ;;
    *) hibernate_app "$(echo "$line" | tr -d '[:space:]')" ;;
  esac
done < "$HIBERNATE_LIST"

# 3. Track kills
track_kills

# 4. Verification - check first 5 apps
echo "=== Verification ===" >> "$LOG"
head -5 "$LIST" | grep -v '^#' | while read -r PKG; do
  PKG=$(echo "$PKG" | tr -d '[:space:]')
  [ -z "$PKG" ] && continue
  dumpsys deviceidle whitelist | grep -q "$PKG" && echo "  $PKG: whitelisted ✓" >> "$LOG" || echo "  $PKG: NOT whitelisted ✗" >> "$LOG"
done

# 5. Update stats
TOTAL_APPLIED=$(grep -c "applied:" "$LOG" 2>/dev/null || echo 0)
FAILED=$(grep -c "failed" "$LOG" 2>/dev/null || echo 0)
echo "{\"total_applied\":$TOTAL_APPLIED,\"failed\":$FAILED,\"last_run\":\"$(date)\"}" > "$STATS"

# 6. Start schedule re-apply (runs in background)
schedule_reapply

echo "=== KernelKeep pass complete ===" >> "$LOG"
