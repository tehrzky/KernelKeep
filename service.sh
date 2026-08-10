#!/system/bin/sh
# KernelKeep — Safety-First Service
# - Bootloop detection (safe mode)
# - System app safelist
# - Batch processing
# - Schedule re-apply

MODDIR=${0%/*}
LIST=/data/adb/kernelkeep/apps.list
LOG=/data/adb/kernelkeep/kernelkeep.log
HIBERNATE_LIST=/data/adb/kernelkeep/hibernate.list
KILL_HISTORY=/data/adb/kernelkeep/kill_history.log
STATS=/data/adb/kernelkeep/stats.json
SAFE_FILE=/data/adb/kernelkeep/safe_mode
BOOT_COUNT_FILE=/data/adb/kernelkeep/boot_count

mkdir -p /data/adb/kernelkeep

# ═══ SAFETY: Bootloop Detection ═══
if [ -f "$BOOT_COUNT_FILE" ]; then
  BOOT_COUNT=$(cat "$BOOT_COUNT_FILE")
  BOOT_COUNT=$((BOOT_COUNT + 1))
else
  BOOT_COUNT=1
fi
echo "$BOOT_COUNT" > "$BOOT_COUNT_FILE"

if [ "$BOOT_COUNT" -gt 3 ]; then
  echo "⚠️ Boot count exceeded 3 – entering safe mode" >> "$LOG"
  touch "$SAFE_FILE"
  echo "=== KernelKeep SAFE MODE (skipping all operations) ===" >> "$LOG"
  exit 0
fi

# ═══ SAFETY: System Safelist — NEVER hibernate these ═══
SYSTEM_SAFELIST="
com.android.systemui
com.android.phone
com.android.settings
com.android.inputmethod
com.android.launcher
com.android.providers.settings
com.android.providers.media
com.android.providers.downloads
com.android.packageinstaller
com.android.permissioncontroller
com.android.networkstack
com.android.wifi
com.android.bluetooth
com.android.nfc
com.android.location
com.android.server
com.android.telephony
com.android.keyguard
com.google.android.gms
com.google.android.gsf
com.google.android.play.games
com.google.android.apps.maps
com.google.android.apps.nexuslauncher
com.google.android.apps.messaging
com.android.vending
com.google.android.setupwizard
com.android.incallui
com.android.dialer
com.android.messaging
com.android.calculator
com.android.calendar
com.android.contacts
com.android.gallery
com.android.camera
com.android.clock
"

is_safe_system_app() {
  echo "$SYSTEM_SAFELIST" | grep -qx "$1"
  return $?
}

# ═══ SAFETY: Safe mode override ═══
if [ -f "$SAFE_FILE" ]; then
  echo "⚠️ Safe mode active – skipping all operations" >> "$LOG"
  rm -f "$SAFE_FILE"
  exit 0
fi

# Wait until system is ready
i=0
while [ "$(getprop sys.boot_completed)" != "1" ] && [ $i -lt 60 ]; do
  sleep 2; i=$((i+1))
done

if [ -z "$(getprop ro.build.version.sdk)" ]; then
  echo "⚠️ System not ready – exiting" >> "$LOG"
  exit 1
fi

sleep 5

echo "=== KernelKeep boot pass $(date) ===" >> "$LOG"

# Reset boot count after successful boot
(
  sleep 60
  echo "0" > "$BOOT_COUNT_FILE"
  echo "✅ Boot count reset" >> "$LOG"
) &

# Detect appops command
if command -v cmd >/dev/null 2>&1; then
  APPOPS_CMD="cmd appops"
else
  APPOPS_CMD="appops"
fi
echo "  Using appops: $APPOPS_CMD" >> "$LOG"

# ═══ BATCH PROCESSING — Process apps in batches ═══
# Read batch size from config (default 3)
BATCH_SIZE=3
if [ -f /data/adb/kernelkeep/batch_size ]; then
  BATCH_SIZE=$(cat /data/adb/kernelkeep/batch_size)
fi

apply_app() {
  PKG="$1"
  pm list packages 2>/dev/null | grep -qx "package:$PKG" || {
    echo "  skip (not installed): $PKG" >> "$LOG"
    return 1
  }
  
  if is_safe_system_app "$PKG"; then
    echo "  ⚠️ SKIP (system critical): $PKG" >> "$LOG"
    return 0
  fi
  
  dumpsys deviceidle whitelist "+$PKG" >>"$LOG" 2>&1 || echo "  whitelist failed" >>"$LOG"
  am set-standby-bucket "$PKG" active >>"$LOG" 2>&1 || echo "  bucket failed" >>"$LOG"
  
  for OP in RUN_IN_BACKGROUND START_FOREGROUND WAKE_LOCK AUTO_START BOOT_COMPLETED; do
    $APPOPS_CMD set "$PKG" "$OP" allow >>"$LOG" 2>&1 || echo "  appops $OP failed" >>"$LOG"
  done
  
  echo "  applied: $PKG" >> "$LOG"
  return 0
}

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
        if [ $count -ge "$BATCH_SIZE" ]; then
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
  for p in "${batch[@]}"; do
    apply_app "$p" &
  done
  wait
}

# ═══ HIBERNATE — SAFETY VERSION ═══
hibernate_app() {
  PKG="$1"
  pm list packages 2>/dev/null | grep -qx "package:$PKG" || {
    echo "  hibernate skip (not installed): $PKG" >> "$LOG"
    return
  }
  
  if is_safe_system_app "$PKG"; then
    echo "  ⛔ SKIP (system critical): $PKG" >> "$LOG"
    return 0
  fi
  
  case "$PKG" in
    com.*|org.*|net.*|app.*) ;;
    *)
      echo "  ⚠️ SKIP (unknown package): $PKG" >> "$LOG"
      return 0
      ;;
  esac
  
  $APPOPS_CMD set "$PKG" RUN_IN_BACKGROUND ignore >>"$LOG" 2>&1
  $APPOPS_CMD set "$PKG" WAKE_LOCK ignore >>"$LOG" 2>&1
  $APPOPS_CMD set "$PKG" START_FOREGROUND ignore >>"$LOG" 2>&1
  $APPOPS_CMD set "$PKG" AUTO_START ignore >>"$LOG" 2>&1
  $APPOPS_CMD set "$PKG" BOOT_COMPLETED ignore >>"$LOG" 2>&1
  
  am force-stop "$PKG" >>"$LOG" 2>&1
  
  echo "  hibernated: $PKG" >> "$LOG"
}

# ═══ SCHEDULE RE-APPLY ═══
schedule_reapply() {
  while true; do
    if [ -f "$SAFE_FILE" ]; then
      echo "⚠️ Safe mode detected – stopping schedule" >> "$LOG"
      break
    fi
    
    # Read schedule interval (default 6 hours)
    SCHEDULE_INTERVAL=21600
    if [ -f /data/adb/kernelkeep/schedule_interval ]; then
      SCHEDULE_INTERVAL=$(cat /data/adb/kernelkeep/schedule_interval)
    fi
    
    # If disabled (0), exit the loop
    if [ "$SCHEDULE_INTERVAL" -eq 0 ]; then
      echo "⏰ Schedule re-apply disabled" >> "$LOG"
      break
    fi
    
    sleep "$SCHEDULE_INTERVAL"
    
    if [ -z "$(getprop ro.build.version.sdk)" ]; then
      echo "⚠️ System not ready – skipping scheduled re-apply" >> "$LOG"
      continue
    fi
    
    echo "=== Scheduled re-apply $(date) ===" >> "$LOG"
    process_batch
    
    while IFS= read -r line; do
      case "$line" in
        ""|\#*) continue ;;
        *) hibernate_app "$(echo "$line" | tr -d '[:space:]')" ;;
      esac
    done < "$HIBERNATE_LIST"
    
    echo "=== Scheduled re-apply complete ===" >> "$LOG"
  done
}

# ═══ MAIN EXECUTION ═══
echo "=== Processing protected apps (batch) ===" >> "$LOG"
process_batch

echo "=== Processing hibernation list ===" >> "$LOG"
while IFS= read -r line; do
  case "$line" in
    ""|\#*) continue ;;
    *) hibernate_app "$(echo "$line" | tr -d '[:space:]')" ;;
  esac
done < "$HIBERNATE_LIST"

echo "=== Verification (first 3 apps) ===" >> "$LOG"
head -3 "$LIST" | grep -v '^#' | while read -r PKG; do
  PKG=$(echo "$PKG" | tr -d '[:space:]')
  [ -z "$PKG" ] && continue
  if dumpsys deviceidle whitelist 2>/dev/null | grep -q "$PKG"; then
    echo "  $PKG: whitelisted ✓" >> "$LOG"
  else
    echo "  $PKG: NOT whitelisted ✗" >> "$LOG"
  fi
done

TOTAL_APPLIED=$(grep -c "applied:" "$LOG" 2>/dev/null || echo 0)
FAILED=$(grep -c "failed" "$LOG" 2>/dev/null || echo 0)
echo "{\"total_applied\":$TOTAL_APPLIED,\"failed\":$FAILED,\"last_run\":\"$(date)\"}" > "$STATS"

schedule_reapply &

echo "=== KernelKeep pass complete ===" >> "$LOG"
echo "✅ Boot successful at $(date)" >> /data/adb/kernelkeep/boot_success.log
