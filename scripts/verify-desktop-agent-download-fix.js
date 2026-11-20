const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

async function main() {
  console.log('===============================================================');
  console.log('VERIFYING P0 FIX: LOCALHOST EMPLOYEE AGENT DOWNLOAD & HUB UX');
  console.log('===============================================================\n');

  const downloadsPath = path.resolve(__dirname, '../docs/employee-monitoring-v2/test-downloads');
  if (!fs.existsSync(downloadsPath)) fs.mkdirSync(downloadsPath, { recursive: true });

  const screenshotsDir = path.resolve(__dirname, '../docs/employee-monitoring-v2/screenshots');
  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900']
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    acceptDownloads: true
  });
  const page = await context.newPage();

  // Test Step 1: Login
  console.log('[Step 1] Navigating to http://localhost:5173/login...');
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });

  console.log('[Step 2] Logging in as ishan@blackhole.ai...');
  await page.fill('#email', 'ishan@blackhole.ai');
  await page.fill('#password', 'Password123!');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  const currentUrl = page.url();
  console.log('[Step 3] Landed on:', currentUrl);
  if (!currentUrl.includes('/userdashboard')) {
    throw new Error(`Expected /userdashboard after login, but got: ${currentUrl}`);
  }

  // Test Step 2: Verify /userdashboard banner
  console.log('\n[Step 4] Checking UserDashboard for Desktop Agent Card & Download Button...');
  const userDashboardText = await page.textContent('body');
  const hasBannerHeader = userDashboardText.includes('Niyantran Desktop Agent (Windows)');
  const hasBannerDownloadBtn = await page.locator('button:has-text("Download Agent (.exe)")').count() > 0;
  const hasOpenHubBtn = await page.locator('button:has-text("Open Agent Hub"), a:has-text("Open Agent Hub")').count() > 0;

  console.log(' - "Niyantran Desktop Agent (Windows)" header found:', hasBannerHeader);
  console.log(' - "Download Agent (.exe)" button found:', hasBannerDownloadBtn);
  console.log(' - "Open Agent Hub" button found:', hasOpenHubBtn);

  if (!hasBannerHeader || !hasBannerDownloadBtn || !hasOpenHubBtn) {
    throw new Error('UserDashboard is missing the Desktop Agent banner or action buttons!');
  }

  const screenshot1Path = path.join(screenshotsDir, 'fix_01_userdashboard_banner.png');
  await page.screenshot({ path: screenshot1Path });
  console.log(' - Saved screenshot:', screenshot1Path);

  // Test Step 3: Verify Sidebar Navigation
  console.log('\n[Step 5] Checking Sidebar navigation links...');
  const desktopAgentSidebarLink = page.locator('aside a[href="/desktop-agent"], nav a[href="/desktop-agent"]');
  const sidebarLinkCount = await desktopAgentSidebarLink.count();
  console.log(' - Desktop Agent sidebar link count:', sidebarLinkCount);
  if (sidebarLinkCount === 0) {
    throw new Error('Desktop Agent sidebar link is missing!');
  }

  // Test Step 4: Navigate to Desktop Agent Hub
  console.log('\n[Step 6] Navigating to Desktop Agent Hub (/desktop-agent)...');
  await desktopAgentSidebarLink.first().click();
  await page.waitForTimeout(2000);

  console.log(' - Current URL:', page.url());
  const hubText = await page.textContent('body');
  const hasHubTitle = hubText.includes('Niyantran Desktop Agent');
  const hasDownloadExeBtn = await page.locator('button:has-text("Download Agent for Windows (.exe)")').count() > 0;
  const hasEnrollmentCard = hubText.includes('Device Enrollment Code');
  const hasInstallGuide = hubText.includes('Installation Guide');
  const hasFAQ = hubText.includes('Troubleshooting & FAQ');

  console.log(' - Hub Title found:', hasHubTitle);
  console.log(' - "Download Agent for Windows (.exe)" button found:', hasDownloadExeBtn);
  console.log(' - Enrollment Code card found:', hasEnrollmentCard);
  console.log(' - Installation Guide found:', hasInstallGuide);
  console.log(' - Troubleshooting & FAQ found:', hasFAQ);

  if (!hasHubTitle || !hasDownloadExeBtn || !hasEnrollmentCard || !hasInstallGuide) {
    throw new Error('Desktop Agent Hub page is missing critical UI components!');
  }

  const screenshot2Path = path.join(screenshotsDir, 'fix_02_desktop_agent_hub.png');
  await page.screenshot({ path: screenshot2Path });
  console.log(' - Saved screenshot:', screenshot2Path);

  // Test Step 5: Test Real Binary Download
  console.log('\n[Step 7] Testing real binary download by clicking "Download Agent for Windows (.exe)"...');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.click('button:has-text("Download Agent for Windows (.exe)")')
  ]);

  const suggestedFileName = download.suggestedFilename();
  console.log(' - Download suggested filename:', suggestedFileName);
  const targetFilePath = path.join(downloadsPath, suggestedFileName);
  await download.saveAs(targetFilePath);

  console.log(' - Download saved to:', targetFilePath);
  const stats = fs.statSync(targetFilePath);
  console.log(' - Downloaded file size:', stats.size, 'bytes');

  if (stats.size < 50000) {
    throw new Error(`Downloaded file is too small (${stats.size} bytes), likely HTML rather than binary!`);
  }

  // Check PE magic bytes (MZ = 0x4D, 0x5A)
  const fd = fs.openSync(targetFilePath, 'r');
  const magic = Buffer.alloc(2);
  fs.readSync(fd, magic, 0, 2, 0);
  fs.closeSync(fd);

  const isPE = magic[0] === 0x4d && magic[1] === 0x5a;
  console.log(` - Magic bytes: 0x${magic[0].toString(16)} 0x${magic[1].toString(16)} ('${magic.toString('ascii')}')`);
  console.log(' - Valid PE Windows Executable (MZ header):', isPE);

  if (!isPE) {
    throw new Error('Downloaded file is NOT a valid Windows PE Executable!');
  }

  // Compute hash
  const fileBuffer = fs.readFileSync(targetFilePath);
  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  console.log(' - SHA-256 Hash:', fileHash);

  // Test Step 6: Verify WorkSessionPage permanent toolbar
  console.log('\n[Step 8] Checking WorkSessionPage (/monitoring-v2/employee) permanent toolbar...');
  await page.goto('http://localhost:5173/monitoring-v2/employee', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const workSessionText = await page.textContent('body');
  const hasAgentToolbar = workSessionText.includes('Desktop Agent:');
  const hasHubBtnInWorkSession = await page.locator('a:has-text("Agent Hub")').count() > 0;
  const hasDownloadBtnInWorkSession = await page.locator('button:has-text("Download Agent (.exe)")').count() > 0;

  console.log(' - WorkSession permanent toolbar found:', hasAgentToolbar);
  console.log(' - "Agent Hub" button found:', hasHubBtnInWorkSession);
  console.log(' - "Download Agent (.exe)" button found:', hasDownloadBtnInWorkSession);

  if (!hasAgentToolbar || !hasHubBtnInWorkSession || !hasDownloadBtnInWorkSession) {
    throw new Error('WorkSessionPage permanent Desktop Agent toolbar is missing!');
  }

  const screenshot3Path = path.join(screenshotsDir, 'fix_03_worksession_permanent_toolbar.png');
  await page.screenshot({ path: screenshot3Path });
  console.log(' - Saved screenshot:', screenshot3Path);

  // Test Step 7: Verify DeviceManagementPage download button
  console.log('\n[Step 9] Checking DeviceManagementPage (/monitoring-v2/devices) download button...');
  await page.goto('http://localhost:5173/monitoring-v2/devices', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const hasDeviceDownloadBtn = await page.locator('button:has-text("Download Agent (.exe)")').count() > 0;
  console.log(' - DeviceManagement "Download Agent (.exe)" button found:', hasDeviceDownloadBtn);

  if (!hasDeviceDownloadBtn) {
    throw new Error('DeviceManagementPage header download button is missing!');
  }

  const screenshot4Path = path.join(screenshotsDir, 'fix_04_devices_header_download.png');
  await page.screenshot({ path: screenshot4Path });
  console.log(' - Saved screenshot:', screenshot4Path);

  console.log('\n===============================================================');
  console.log('ALL VERIFICATION CHECKS PASSED WITH 100% SUCCESS!');
  console.log('===============================================================');

  await browser.close();
}

main().catch(err => {
  console.error('\n[VERIFICATION FAILED]:', err);
  process.exit(1);
});
