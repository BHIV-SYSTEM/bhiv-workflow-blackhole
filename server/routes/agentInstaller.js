const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const INSTALLER_FILE_NAME = 'Employee Activity Agent Setup 1.0.0.exe';

// Local-dev default: the electron-builder output inside the repo.
// (employee-agent/dist is gitignored and NOT part of the Docker build context
//  — server/Dockerfile builds with context `server/` — so production must point
//  AGENT_INSTALLER_PATH at a bind-mounted copy of the exe. See
//  docker-compose.production.template.yml → backend.volumes.)
const DEFAULT_INSTALLER_PATH = path.resolve(__dirname, '../../employee-agent/dist', INSTALLER_FILE_NAME);

/**
 * Resolve the installer file location.
 * Priority: AGENT_INSTALLER_PATH env (absolute, or relative to the server's
 * working directory) → repo-relative default used by local development.
 */
function resolveInstallerPath() {
  const fromEnv = (process.env.AGENT_INSTALLER_PATH || '').trim();
  if (!fromEnv) return DEFAULT_INSTALLER_PATH;
  return path.isAbsolute(fromEnv) ? fromEnv : path.resolve(process.cwd(), fromEnv);
}

// The exe is ~77 MB; hashing it on every /info poll would waste seconds of CPU
// per request. Cache the metadata keyed by resolved path + size + mtime.
const metaCache = new Map();

function getInstallerMeta() {
  const installerPath = resolveInstallerPath();
  try {
    const stats = fs.statSync(installerPath);
    if (!stats.isFile()) {
      return { available: false, version: '1.0.0', platform: 'win32-x64', installerPath };
    }
    const cacheKey = `${stats.size}:${stats.mtimeMs}`;
    const cached = metaCache.get(installerPath);
    if (cached && cached.key === cacheKey) {
      return { ...cached.meta, installerPath };
    }
    const sha256 = crypto.createHash('sha256')
      .update(fs.readFileSync(installerPath))
      .digest('hex')
      .toUpperCase();
    const meta = {
      available: true,
      fileName: INSTALLER_FILE_NAME,
      format: 'exe',
      fileSize: stats.size,
      sizeBytes: stats.size,
      sha256,
      version: '1.0.0',
      platform: 'win32-x64',
      lastModified: stats.mtime.toISOString(),
      supportsSilentInstall: true,
    };
    metaCache.set(installerPath, { key: cacheKey, meta });
    return { ...meta, installerPath };
  } catch {
    return { available: false, version: '1.0.0', platform: 'win32-x64', installerPath };
  }
}

router.get('/info', (req, res) => {
  const meta = getInstallerMeta();
  return res.status(200).json({ success: true, ...meta, downloadUrl: '/api/agent/installer/download', instructions: ['Download and run "Employee Activity Agent Setup 1.0.0.exe".', 'Follow the installer prompts; the agent starts automatically in the system tray.', 'Log in with your Niyantran account inside the agent to begin monitoring.'] });
});

router.get('/download', (req, res) => {
  const installerPath = resolveInstallerPath();
  if (!fs.existsSync(installerPath)) {
    // Ops-visible diagnostics: the 404 body tells us exactly which path was
    // checked and whether AGENT_INSTALLER_PATH was set in the container.
    console.warn(`[agent-installer] Installer NOT FOUND at "${installerPath}" (AGENT_INSTALLER_PATH=${process.env.AGENT_INSTALLER_PATH || 'unset'})`);
    return res.status(404).json({
      error: 'Agent installer package not found on server',
      code: 'INSTALLER_NOT_FOUND',
      installerPath,
    });
  }
  const filename = INSTALLER_FILE_NAME;
  res.setHeader('Content-Type', 'application/vnd.microsoft.portable-executable');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.sendFile(installerPath, (err) => {
    if (err && !res.headersSent) {
      console.error(`[agent-installer] Failed to stream "${installerPath}": ${err.message}`);
      res.status(404).json({
        error: 'Agent installer package not found on server',
        code: 'INSTALLER_NOT_FOUND',
        installerPath,
      });
    }
  });
});

module.exports = router;
