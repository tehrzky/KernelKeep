// ===== System app safelist =====
const SYSTEM_SAFELIST = [
  'com.android.systemui',
  'com.android.phone',
  'com.android.settings',
  'com.android.inputmethod',
  'com.android.launcher',
  'com.android.providers.settings',
  'com.android.providers.media',
  'com.android.providers.downloads',
  'com.android.packageinstaller',
  'com.android.permissioncontroller',
  'com.android.networkstack',
  'com.android.wifi',
  'com.android.bluetooth',
  'com.android.nfc',
  'com.android.location',
  'com.android.server',
  'com.android.telephony',
  'com.android.keyguard',
  'com.google.android.gms',
  'com.google.android.gsf',
  'com.google.android.play.games',
  'com.google.android.apps.maps',
  'com.google.android.apps.nexuslauncher',
  'com.google.android.apps.messaging',
  'com.android.vending',
  'com.google.android.setupwizard',
  'com.android.incallui',
  'com.android.dialer',
  'com.android.messaging',
  'com.android.calculator',
  'com.android.calendar',
  'com.android.contacts',
  'com.android.gallery',
  'com.android.camera',
  'com.android.clock'
];

function isSystemApp(pkg) {
  return SYSTEM_SAFELIST.includes(pkg);
}

function isSafeToHibernate(pkg) {
  return !isSystemApp(pkg);
}
