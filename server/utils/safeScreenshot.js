const screenshot = require('screenshot-desktop');

let headlessWarningLogged = false;

/**
 * Determine whether the host OS currently exposes a graphical desktop session.
 * On headless Linux Docker containers (no DISPLAY / WAYLAND_DISPLAY), calling
 * screenshot-desktop triggers `xrandr --current` inside listDisplays() whose
 * rejection is un-handled by the library and crashes Node v18+.
 */
function hasDesktopDisplay() {
  if (process.platform === 'linux') {
    return Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
  }
  return true;
}

/**
 * Safely capture a desktop screenshot without risking unhandled rejections
 * from headless Linux display probes. Returns a PNG/JPEG Buffer or null if
 * running headless or capture fails.
 */
async function captureSafeScreenshot(options = { format: 'png' }) {
  if (!hasDesktopDisplay()) {
    if (!headlessWarningLogged) {
      headlessWarningLogged = true;
      console.log('📸 Headless environment detected (no DISPLAY/WAYLAND_DISPLAY) - skipping server-side desktop capture');
    }
    return null;
  }

  try {
    const buffer = await screenshot(options);
    return buffer || null;
  } catch (err) {
    console.warn('📸 Desktop screenshot capture failed (non-fatal):', err.message);
    return null;
  }
}

module.exports = {
  hasDesktopDisplay,
  captureSafeScreenshot
};

