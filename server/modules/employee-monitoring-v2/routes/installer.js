/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Authenticated Agent Installer & Distribution Route
 * 
 * Endpoints:
 * - GET /api/monitoring-v2/installer/info (Auth: Optional / Open)
 * - GET /api/monitoring-v2/installer/download (Auth: v2Auth)
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const v2Auth = require('../security/v2Auth');

// Single source of truth: every download button in the web app serves the
// current V1 desktop agent build, so the download section is always up to date.
const DIST_DIR = path.resolve(__dirname, '../../../../employee-agent/dist');
const EXE_INSTALLER_PATH = path.join(DIST_DIR, 'Employee Activity Agent Setup 1.0.0.exe');

function getInstallerMeta() {
  const chosenPath = EXE_INSTALLER_PATH;
  if (fs.existsSync(chosenPath)) {
    const stats = fs.statSync(chosenPath);
    const fileBuffer = fs.readFileSync(chosenPath);
    const rawSha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const sha256 = rawSha256.toUpperCase();
    return {
      available: true,
      fileName: 'Employee Activity Agent Setup 1.0.0.exe',
      format: 'exe',
      fileSize: stats.size,
      sizeBytes: stats.size,
      sha256,
      version: '1.0.0',
      platform: 'win32-x64',
      lastModified: stats.mtime.toISOString(),
      supportsSilentInstall: true,
      silentArgs: '/S'
    };
  }

  return {
    available: false,
    version: '1.0.0',
    platform: 'win32-x64'
  };
}

// GET /api/monitoring-v2/installer/info
router.get('/info', (req, res) => {
  const meta = getInstallerMeta();
  return res.status(200).json({
    success: true,
    ...meta,
    downloadUrl: '/api/monitoring-v2/installer/download',
    instructions: [
      'Download and run NiyantranMonitoringAgentV2-Setup.exe.',
      'Review privacy disclosure and click Install (or run silently: NiyantranMonitoringAgentV2-Setup.exe /S).',
      'The agent starts automatically in the Windows system tray.',
      'Copy the 6-digit enrollment code from your Niyantran dashboard to pair your workstation.'
    ]
  });
});

// GET /api/monitoring-v2/installer/download
router.get('/download', v2Auth, (req, res) => {
  const format = req.query.format;
  if (format && !['exe', 'zip'].includes(format.toLowerCase())) {
    return res.status(400).json({
      error: `Unsupported installer format '${format}'. Supported formats: exe, zip`,
      code: 'UNSUPPORTED_FORMAT'
    });
  }

  // Only one agent ships now (V1); both formats resolve to the same package.
  const targetPath = EXE_INSTALLER_PATH;

  if (!fs.existsSync(targetPath)) {
    return res.status(404).json({
      error: 'Agent installer package not found on server',
      code: 'INSTALLER_NOT_FOUND'
    });
  }

  const filename = 'Employee Activity Agent Setup 1.0.0.exe';
  const contentType = 'application/vnd.microsoft.portable-executable';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.sendFile(targetPath);
});

module.exports = router;
