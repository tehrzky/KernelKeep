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
