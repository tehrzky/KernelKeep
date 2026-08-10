# KernelKeep

Keep your apps alive by preventing Android's Doze and background restrictions.

## Features

- 🔒 **Whitelist apps** from Device Idle (Doze)
- ⚡ **Set standby bucket** to `active`
- 🛠️ **Grant appops permissions** (RUN_IN_BACKGROUND, WAKE_LOCK, etc.)
- 🖥️ **WebUI** for easy management (KernelSU only)
- 📋 **Boot-time enforcement** with detailed logging

## Requirements

- **KernelSU** (for WebUI) or **Magisk** (manual config)
- Android 8.0+

## Installation

1. Download the latest `KernelKeep-vX.X.X.zip`
2. Install via KernelSU Manager or Magisk Manager
3. Reboot
4. Open WebUI from KernelSU Manager module page
5. Add your apps to protect

## Manual Configuration

Edit `/data/adb/kernelkeep/apps.list` and add one package name per line:

```bash
com.example.app1
com.example.app2
