# KernelKeep

Keep your apps alive, hibernate battery drainers, and monitor protection stats.

## Features

- 🛡️ **Protect Apps** – Whitelist from Doze, set standby bucket to active
- 💤 **Hibernate Apps** – Block background activity (perfect for Facebook, X)
- 📊 **Protection Stats** – Track applied/failed apps
- 💀 **Kill History** – See when apps are killed
- ⏰ **Schedule Re-Apply** – Auto-reapply settings every X hours
- ⚡ **Batch Processing** – Process apps in batches for faster boot
- 🛡️ **Safety First** – Bootloop detection, system app safelist, safe mode
- 📤 **Export/Import** – Backup and restore your configuration

## Installation

1. Download the latest ZIP
2. Install via KernelSU Manager
3. Reboot
4. Open WebUI from module page

## Safety

- **Bootloop detection** – Auto-disables after 3 failed boots
- **System app safelist** – Never hibernates critical system apps
- **Safe mode** – Manual override if issues occur

## Recovery

If you experience bootloop:
1. Reboot into safe mode (hold volume down during boot)
2. Or use ADB: `touch /data/adb/kernelkeep/safe_mode`
3. Reboot normally – the module will be disabled

## License

MIT License
