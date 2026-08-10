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

# Deploy WebUI files to webroot
mkdir -p "$MODPATH/webroot"
cp -f "$MODPATH/index.html" "$MODPATH/webroot/"
cp -f "$MODPATH/style.css" "$MODPATH/webroot/"
cp -f "$MODPATH/app.js" "$MODPATH/webroot/"
ui_print "- WebUI files installed to webroot/"

# Set permissions
set_perm_recursive "$MODPATH" 0 0 0755 0644
set_perm "$MODPATH/service.sh" 0 0 0755

ui_print "- Done. Reboot to activate. Logs: /data/adb/kernelkeep/kernelkeep.log"
