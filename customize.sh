#!/system/bin/sh
# KernelKeep — Magisk/KernelSU install-time customization.
SKIPUNZIP=0

ui_print "  _  _   _   ___  _  _  ___  _   _   ___  ___  _  _  ___ "
ui_print " | |/ / | | / _ \| \| |/ _ \| | / / / _ \| _ \| \| |/ _ \ "
ui_print " | ' <  | |/ /_\ \ .  | /_\ \ |/ / | /_\ |  _/| .  | /_\ | "
ui_print " |_|\_\ |_|\____/|_|\_|\____/|___/  \____/|_|  |_|\_|\____/ "
ui_print " "
ui_print "- Installing KernelKeep keep-alive enforcer"

# Create data directory
mkdir -p /data/adb/kernelkeep

# Create default apps.list if missing
if [ ! -f /data/adb/kernelkeep/apps.list ]; then
  cat > /data/adb/kernelkeep/apps.list <<'EOF'
# KernelKeep — add one package name per line, then reboot.
# Example:
# com.your.app
EOF
  ui_print "- Created /data/adb/kernelkeep/apps.list"
  ui_print "  Edit it and add your package names, then reboot."
else
  ui_print "- Existing apps.list kept."
fi

# Create default hibernate.list if missing
if [ ! -f /data/adb/kernelkeep/hibernate.list ]; then
  cat > /data/adb/kernelkeep/hibernate.list <<'EOF'
# KernelKeep — Hibernate List
# Apps here will have their background activity blocked.
# Icon stays on launcher, app only runs when opened.
# Example:
# com.facebook.katana
# com.twitter.android
EOF
  ui_print "- Created /data/adb/kernelkeep/hibernate.list"
else
  ui_print "- Existing hibernate.list kept."
fi

# Deploy WebUI files to webroot
mkdir -p "$MODPATH/webroot"
cp -f "$MODPATH/index.html" "$MODPATH/webroot/"
cp -f "$MODPATH/style.css" "$MODPATH/webroot/"
cp -f "$MODPATH/app.js" "$MODPATH/webroot/"
ui_print "- WebUI files installed to webroot/"

# Create cache refresh script
cat > "$MODPATH/refresh_cache.sh" <<'EOF'
#!/system/bin/sh
# Refresh app cache for KernelKeep
CACHE=/data/adb/kernelkeep/apps.cache
TMP=/data/adb/kernelkeep/apps.cache.tmp

{
  echo "#USER"
  pm list packages -3 2>/dev/null | sed 's/^package://'
  echo "#SYS"
  pm list packages -s 2>/dev/null | sed 's/^package://'
} > "$TMP" 2>/dev/null

if [ -s "$TMP" ]; then
  mv "$TMP" "$CACHE"
  echo "Cache updated at $(date)" > /data/adb/kernelkeep/cache.log
else
  rm -f "$TMP"
  echo "Cache update failed at $(date)" >> /data/adb/kernelkeep/cache.log
fi
EOF
chmod 755 "$MODPATH/refresh_cache.sh"
ui_print "- Created refresh_cache.sh"

# Pre-generate cache (runs in background to avoid install delay)
sh "$MODPATH/refresh_cache.sh" &
ui_print "- Generating app cache in background..."

# Set permissions
set_perm_recursive "$MODPATH" 0 0 0755 0644
set_perm "$MODPATH/service.sh" 0 0 0755
set_perm "$MODPATH/refresh_cache.sh" 0 0 0755

ui_print "- Done. Reboot to activate."
ui_print "  Logs: /data/adb/kernelkeep/kernelkeep.log"
ui_print "  Cache: /data/adb/kernelkeep/apps.cache"
