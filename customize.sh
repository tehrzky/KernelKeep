#!/system/bin/sh
# DKMA Monster — Magisk install-time customization.
SKIPUNZIP=0

ui_print "  ___  _  ____  __  __    __  __  ___  _  _ ___ _____ ___ ___"
ui_print " |   \| |/ /  \/  |/  \  |  \/  |/ _ \| \| / __|_   _| __| _ \\"
ui_print " | |) | ' <| |\/| / /\ \ | |\/| | (_) | .  \__ \ | | | _||   /"
ui_print " |___/|_|\_\_|  |_/_/  \_\|_|  |_|\___/|_|\_|___/ |_| |___|_|_\\"
ui_print " "
ui_print "- Installing DKMA Monster keep-alive enforcer"

mkdir -p /data/adb/dkma
if [ ! -f /data/adb/dkma/apps.list ]; then
  cat > /data/adb/dkma/apps.list <<'EOF'
# DKMA Monster — add one package name per line, then reboot.
# Example:
# com.your.app
EOF
  ui_print "- Created /data/adb/dkma/apps.list"
  ui_print "  Edit it and add your package names, then reboot."
else
  ui_print "- Existing apps.list kept."
fi

set_perm_recursive "$MODPATH" 0 0 0755 0644
set_perm "$MODPATH/service.sh" 0 0 0755
ui_print "- Done. Reboot to activate. Logs: /data/adb/dkma/dkma.log"
