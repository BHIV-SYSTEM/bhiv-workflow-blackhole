const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DIST_DIR = path.resolve(__dirname, '../../employee-agent/dist');
const EXE_INSTALLER_PATH = path.join(DIST_DIR, 'Employee Activity Agent Setup 1.0.0.exe');

function getInstallerMeta() {
  if (fs.existsSync(EXE_INSTALLER_PATH)) {
    const stats = fs.statSync(EXE_INSTALLER_PATH);
    const fileBuffer = fs.readFileSync(EXE_INSTALLER_PATH);
    const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex').toUpperCase();
    return { available: true, fileName: 'Employee Activity Agent Setup 1.0.0.exe', format: 'exe', fileSize: stats.size, sizeBytes: stats.size, sha256, version: '1.0.0', platform: 'win32-x64', lastModified: stats.mtime.toISOString(), supportsSilentInstall: true };
  }
  return { available: false, version: '1.0.0', platform: 'win32-x64' };
}

router.get('/info', (req, res) => {
  const meta = getInstallerMeta();
  return res.status(200).json({ success: true, ...meta, downloadUrl: '/api/agent/installer/download', instructions: ['Download and run "Employee Activity Agent Setup 1.0.0.exe".', 'Follow the installer prompts; the agent starts automatically in the system tray.', 'Log in with your Niyantran account inside the agent to begin monitoring.'] });
});

router.get('/download', (req, res) => {
  if (!fs.existsSync(EXE_INSTALLER_PATH)) {
    return res.status(404).json({ error: 'Agent installer package not found on server', code: 'INSTALLER_NOT_FOUND' });
  }
  const filename = 'Employee Activity Agent Setup 1.0.0.exe';
  res.setHeader('Content-Type', 'application/vnd.microsoft.portable-executable');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.sendFile(EXE_INSTALLER_PATH);
});

module.exports = router;
