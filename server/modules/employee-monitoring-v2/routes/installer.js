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

// Paths to pre-packaged installer deliverables (V2 primary, V1 fallback)
const DIST_DIR_V2 = path.resolve(__dirname, '../../../../employee-agent-v2/dist');
const EXE_INSTALLER_V2 = path.join(DIST_DIR_V2, 'NiyantranMonitoringAgentV2-Setup.exe');
const ZIP_INSTALLER_V2 = path.join(DIST_DIR_V2, 'Niyantran-Agent-V2-Setup.zip');

const DIST_DIR_V1 = path.resolve(__dirname, '../../../../employee-agent/dist');
const EXE_INSTALLER_V1 = path.join(DIST_DIR_V1, 'Employee Activity Agent Setup 1.0.0.exe');

function resolveInstallerPath(format) {
  const wantsZip = format && format.toLowerCase() === 'zip';
  if (wantsZip && fs.existsSync(ZIP_INSTALLER_V2)) {
    return ZIP_INSTALLER_V2;
  }
  if (fs.existsSync(EXE_INSTALLER_V2)) {
    return EXE_INSTALLER_V2;
  }
  if (fs.existsSync(ZIP_INSTALLER_V2)) {
    return ZIP_INSTALLER_V2;
  }
  if (fs.existsSync(EXE_INSTALLER_V1)) {
    return EXE_INSTALLER_V1;
  }
  return null;
}

function getInstallerMeta() {
  const chosenPath = resolveInstallerPath();
  if (chosenPath && fs.existsSync(chosenPath)) {
    const stats = fs.statSync(chosenPath);
    const fileBuffer = fs.readFileSync(chosenPath);
    const rawSha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const sha256 = rawSha256.toUpperCase();
    const isV2 = chosenPath.includes('employee-agent-v2');
    const isExe = chosenPath.endsWith('.exe');
    return {
      available: true,
      fileName: path.basename(chosenPath),
      format: isExe ? 'exe' : 'zip',
      fileSize: stats.size,
      sizeBytes: stats.size,
      sha256,
      version: isV2 ? '2.0.0' : '1.0.0',
      platform: 'win32-x64',
      lastModified: stats.mtime.toISOString(),
      supportsSilentInstall: isExe,
      silentArgs: isExe ? '/S' : '-SkipPrompt'
    };
  }

  return {
    available: false,
    version: '2.0.0',
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

  const targetPath = resolveInstallerPath(format);

  if (!targetPath || !fs.existsSync(targetPath)) {
    return res.status(404).json({
      error: 'Agent installer package not found on server',
      code: 'INSTALLER_NOT_FOUND'
    });
  }

  const isExe = targetPath.endsWith('.exe');
  const filename = path.basename(targetPath);
  const contentType = isExe ? 'application/vnd.microsoft.portable-executable' : 'application/zip';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.sendFile(targetPath);
});

module.exports = router;
