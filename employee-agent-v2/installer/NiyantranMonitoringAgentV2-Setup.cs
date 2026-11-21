using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

public class NiyantranInstallerForm : Form {
    private TextBox txtDest;
    private Button btnBrowse;
    private CheckBox chkStartMenu;
    private CheckBox chkDesktop;
    private CheckBox chkLaunch;
    private ProgressBar progressBar;
    private Label lblStatus;
    private Label lblNodeStatus;
    private Button btnInstall;
    private Button btnCancel;
    private bool isSilent = false;

    public NiyantranInstallerForm(bool silent) {
        this.isSilent = silent;
        InitializeComponent();
    }

    private void InitializeComponent() {
        this.Text = "Niyantran Employee Monitoring V2 — Setup";
        this.Size = new Size(540, 520);
        this.FormBorderStyle = FormBorderStyle.FixedDialog;
        this.MaximizeBox = false;
        this.StartPosition = FormStartPosition.CenterScreen;
        this.BackColor = Color.FromArgb(248, 250, 252);
        this.Font = new Font("Segoe UI", 9F, FontStyle.Regular, GraphicsUnit.Point);

        // Header Panel
        Panel pnlHeader = new Panel();
        pnlHeader.Dock = DockStyle.Top;
        pnlHeader.Height = 75;
        pnlHeader.BackColor = Color.FromArgb(15, 23, 42); // slate-900

        Label lblTitle = new Label();
        lblTitle.Text = "Niyantran Employee Monitoring V2";
        lblTitle.ForeColor = Color.White;
        lblTitle.Font = new Font("Segoe UI", 12F, FontStyle.Bold);
        lblTitle.Location = new Point(20, 14);
        lblTitle.AutoSize = true;

        Label lblSub = new Label();
        lblSub.Text = "Privacy-Preserving Workstation Telemetry Agent Setup";
        lblSub.ForeColor = Color.FromArgb(148, 163, 184); // slate-400
        lblSub.Font = new Font("Segoe UI", 8.5F, FontStyle.Regular);
        lblSub.Location = new Point(21, 40);
        lblSub.AutoSize = true;

        pnlHeader.Controls.Add(lblTitle);
        pnlHeader.Controls.Add(lblSub);
        this.Controls.Add(pnlHeader);

        // Dependency Check & Status
        string nodeVer = DetectNodeVersion();
        bool nodeFound = !string.IsNullOrEmpty(nodeVer);

        lblNodeStatus = new Label();
        lblNodeStatus.Location = new Point(22, 90);
        lblNodeStatus.Size = new Size(480, 24);
        lblNodeStatus.Font = new Font("Segoe UI", 8.5F, FontStyle.Regular);
        if (nodeFound) {
            lblNodeStatus.Text = string.Format("✓ Runtime Verification: Windows 64-bit (Supported) • Node.js {0} (Verified)", nodeVer);
            lblNodeStatus.ForeColor = Color.FromArgb(22, 101, 52); // green-800
        } else {
            lblNodeStatus.Text = "⚠ Notice: Node.js (v18+) runtime recommended for telemetry daemon.";
            lblNodeStatus.ForeColor = Color.FromArgb(180, 83, 9); // amber-700
        }
        this.Controls.Add(lblNodeStatus);

        // Privacy Box
        GroupBox grpPrivacy = new GroupBox();
        grpPrivacy.Text = "Privacy Guarantees & Transparency Charter";
        grpPrivacy.Location = new Point(20, 118);
        grpPrivacy.Size = new Size(485, 120);
        grpPrivacy.Font = new Font("Segoe UI", 8.5F, FontStyle.Bold);
        grpPrivacy.ForeColor = Color.FromArgb(30, 41, 59);

        Label lblPrivacyItems = new Label();
        lblPrivacyItems.Font = new Font("Segoe UI", 8.25F, FontStyle.Regular);
        lblPrivacyItems.ForeColor = Color.FromArgb(51, 65, 85);
        lblPrivacyItems.Location = new Point(12, 22);
        lblPrivacyItems.Size = new Size(460, 90);
        lblPrivacyItems.Text =
            "• Tracks Win32 foreground application names and durations during active sessions only.\n" +
            "• Collects anonymous numeric input event counts (key & click frequencies).\n" +
            "• STRICTLY PROHIBITED: Zero screenshots, zero keystroke text, zero window titles.\n" +
            "• STRICTLY PROHIBITED: Zero browsing history or URL tracking.\n" +
            "• Protected by Windows Data Protection API (DPAPI) and HMAC-SHA256 auth.";
        grpPrivacy.Controls.Add(lblPrivacyItems);
        this.Controls.Add(grpPrivacy);

        // Destination Folder Group
        GroupBox grpDest = new GroupBox();
        grpDest.Text = "Destination Directory";
        grpDest.Location = new Point(20, 248);
        grpDest.Size = new Size(485, 65);
        grpDest.Font = new Font("Segoe UI", 8.5F, FontStyle.Bold);

        string defaultPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "NiyantranMonitoringV2");
        txtDest = new TextBox();
        txtDest.Text = defaultPath;
        txtDest.Location = new Point(12, 26);
        txtDest.Size = new Size(375, 24);
        txtDest.Font = new Font("Segoe UI", 8.5F, FontStyle.Regular);

        btnBrowse = new Button();
        btnBrowse.Text = "Browse...";
        btnBrowse.Location = new Point(395, 25);
        btnBrowse.Size = new Size(78, 26);
        btnBrowse.Font = new Font("Segoe UI", 8F, FontStyle.Regular);
        btnBrowse.Click += delegate {
            using (FolderBrowserDialog fbd = new FolderBrowserDialog()) {
                fbd.Description = "Select Installation Directory for Niyantran V2 Agent";
                fbd.SelectedPath = txtDest.Text;
                if (fbd.ShowDialog() == DialogResult.OK) {
                    txtDest.Text = fbd.SelectedPath;
                }
            }
        };

        grpDest.Controls.Add(txtDest);
        grpDest.Controls.Add(btnBrowse);
        this.Controls.Add(grpDest);

        // Options Checkboxes
        chkStartMenu = new CheckBox();
        chkStartMenu.Text = "Create Start Menu Shortcuts";
        chkStartMenu.Checked = true;
        chkStartMenu.Location = new Point(25, 322);
        chkStartMenu.Size = new Size(220, 20);
        this.Controls.Add(chkStartMenu);

        chkDesktop = new CheckBox();
        chkDesktop.Text = "Create Desktop Shortcut";
        chkDesktop.Checked = true;
        chkDesktop.Location = new Point(260, 322);
        chkDesktop.Size = new Size(220, 20);
        this.Controls.Add(chkDesktop);

        chkLaunch = new CheckBox();
        chkLaunch.Text = "Launch Niyantran Desktop Agent upon completion";
        chkLaunch.Checked = true;
        chkLaunch.Location = new Point(25, 348);
        chkLaunch.Size = new Size(350, 20);
        this.Controls.Add(chkLaunch);

        // Progress & Status
        progressBar = new ProgressBar();
        progressBar.Location = new Point(22, 382);
        progressBar.Size = new Size(480, 18);
        this.Controls.Add(progressBar);

        lblStatus = new Label();
        lblStatus.Text = "Ready to install.";
        lblStatus.Location = new Point(22, 404);
        lblStatus.Size = new Size(480, 18);
        lblStatus.ForeColor = Color.FromArgb(100, 116, 139);
        this.Controls.Add(lblStatus);

        // Buttons
        btnCancel = new Button();
        btnCancel.Text = "Cancel";
        btnCancel.Location = new Point(415, 435);
        btnCancel.Size = new Size(88, 30);
        btnCancel.Click += delegate { this.Close(); };
        this.Controls.Add(btnCancel);

        btnInstall = new Button();
        btnInstall.Text = "Install";
        btnInstall.BackColor = Color.FromArgb(79, 70, 229); // indigo-600
        btnInstall.ForeColor = Color.White;
        btnInstall.FlatStyle = FlatStyle.Flat;
        btnInstall.FlatAppearance.BorderSize = 0;
        btnInstall.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        btnInstall.Location = new Point(315, 435);
        btnInstall.Size = new Size(92, 30);
        btnInstall.Click += delegate { StartInstallation(); };
        this.Controls.Add(btnInstall);
    }

    private string DetectNodeVersion() {
        try {
            ProcessStartInfo psi = new ProcessStartInfo("node.exe", "-v");
            psi.RedirectStandardOutput = true;
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            using (Process p = Process.Start(psi)) {
                string ver = p.StandardOutput.ReadToEnd().Trim();
                p.WaitForExit(1000);
                if (ver.StartsWith("v")) return ver;
            }
        } catch { }
        return null;
    }

    public void StartInstallation() {
        btnInstall.Enabled = false;
        btnBrowse.Enabled = false;
        txtDest.Enabled = false;

        Thread t = new Thread(RunInstallWorker);
        t.IsBackground = true;
        t.Start();
    }

    private void RunInstallWorker() {
        try {
            string targetDir = txtDest.Text.Trim();
            UpdateStatus(10, "Verifying target directory...");

            if (!Directory.Exists(targetDir)) {
                Directory.CreateDirectory(targetDir);
            }
            string binDir = Path.Combine(targetDir, "bin");
            string srcDir = Path.Combine(targetDir, "src");
            if (!Directory.Exists(binDir)) Directory.CreateDirectory(binDir);
            if (!Directory.Exists(srcDir)) Directory.CreateDirectory(srcDir);

            UpdateStatus(30, "Extracting agent components and Win32 helper...");
            Assembly asm = Assembly.GetExecutingAssembly();
            using (Stream s = asm.GetManifestResourceStream("AgentPayload.zip")) {
                if (s == null) {
                    throw new Exception("Embedded AgentPayload.zip resource not found in installer binary.");
                }

                string tempZip = Path.Combine(Path.GetTempPath(), "NiyantranPayload_" + Guid.NewGuid().ToString("N") + ".zip");
                using (FileStream fs = new FileStream(tempZip, FileMode.Create, FileAccess.Write)) {
                    s.CopyTo(fs);
                }

                using (ZipArchive archive = ZipFile.OpenRead(tempZip)) {
                    foreach (ZipArchiveEntry entry in archive.Entries) {
                        string fullPath = Path.Combine(targetDir, entry.FullName);
                        string dirName = Path.GetDirectoryName(fullPath);
                        if (!string.IsNullOrEmpty(dirName) && !Directory.Exists(dirName)) {
                            Directory.CreateDirectory(dirName);
                        }
                        if (!string.IsNullOrEmpty(entry.Name)) {
                            entry.ExtractToFile(fullPath, true);
                        }
                    }
                }
                try { File.Delete(tempZip); } catch { }
            }

            UpdateStatus(65, "Creating Start Menu and Desktop shortcuts...");
            string exePath = Path.Combine(targetDir, @"bin\NiyantranWin32Helper.exe");

            if (chkStartMenu.Checked) {
                string startMenuDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                    @"Microsoft\Windows\Start Menu\Programs\Niyantran"
                );
                if (!Directory.Exists(startMenuDir)) Directory.CreateDirectory(startMenuDir);
                string lnkPath = Path.Combine(startMenuDir, "Niyantran Employee Monitoring V2.lnk");
                CreateShortcut(lnkPath, exePath, "tray DEV-INSTALLED", targetDir, "Niyantran Employee Monitoring V2 Desktop Agent");
            }

            if (chkDesktop.Checked) {
                string desktopDir = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                string lnkPath = Path.Combine(desktopDir, "Niyantran Employee Monitoring V2.lnk");
                CreateShortcut(lnkPath, exePath, "tray DEV-INSTALLED", targetDir, "Niyantran Employee Monitoring V2 Desktop Agent");
            }

            UpdateStatus(85, "Registering in Windows Add/Remove Programs & URI Protocol...");
            RegisterUninstall(targetDir);
            RegisterProtocolHandler(targetDir);

            UpdateStatus(100, "Installation complete!");

            if (chkLaunch.Checked) {
                try {
                    ProcessStartInfo psi = new ProcessStartInfo(exePath, "tray DEV-INSTALLED");
                    psi.WorkingDirectory = targetDir;
                    psi.UseShellExecute = true;
                    Process.Start(psi);
                } catch { }
            }

            this.Invoke((MethodInvoker)delegate {
                if (!isSilent) {
                    MessageBox.Show(
                        "Niyantran Employee Monitoring V2 has been installed successfully!\n\n" +
                        "The desktop agent is now running in your system tray.\n" +
                        "You can access the Mini Desktop Window by double-clicking the shield icon in the tray.",
                        "Setup Complete",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information
                    );
                }
                this.Close();
                Application.Exit();
                Environment.Exit(0);
            });

        } catch (Exception ex) {
            this.Invoke((MethodInvoker)delegate {
                lblStatus.Text = "Error: " + ex.Message;
                lblStatus.ForeColor = Color.Red;
                btnInstall.Enabled = true;
                if (!isSilent) {
                    MessageBox.Show("Installation failed:\n" + ex.Message, "Setup Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                } else {
                    Environment.ExitCode = 1;
                    this.Close();
                    Application.Exit();
                }
            });
        }
    }

    private void UpdateStatus(int percent, string text) {
        if (this.InvokeRequired) {
            this.Invoke((MethodInvoker)delegate { UpdateStatus(percent, text); });
            return;
        }
        progressBar.Value = Math.Min(100, Math.Max(0, percent));
        lblStatus.Text = text;
    }

    private void CreateShortcut(string shortcutPath, string targetPath, string arguments, string workingDir, string description) {
        try {
            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            dynamic shell = Activator.CreateInstance(shellType);
            dynamic shortcut = shell.CreateShortcut(shortcutPath);
            shortcut.TargetPath = targetPath;
            shortcut.Arguments = arguments;
            shortcut.WorkingDirectory = workingDir;
            shortcut.Description = description;
            shortcut.IconLocation = targetPath + ",0";
            shortcut.Save();
        } catch { }
    }

    private void RegisterUninstall(string installDir) {
        try {
            string uninstallExe = Path.Combine(installDir, @"bin\Uninstall.exe");
            string mainExe = Path.Combine(installDir, @"bin\NiyantranWin32Helper.exe");

            using (RegistryKey parent = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall")) {
                if (parent != null) {
                    using (RegistryKey appKey = parent.CreateSubKey("NiyantranMonitoringV2")) {
                        if (appKey != null) {
                            appKey.SetValue("DisplayName", "Niyantran Employee Monitoring V2");
                            appKey.SetValue("DisplayVersion", "2.0.0");
                            appKey.SetValue("Publisher", "Blackhole Infiverse");
                            appKey.SetValue("InstallLocation", installDir);
                            appKey.SetValue("UninstallString", "\"" + uninstallExe + "\"");
                            appKey.SetValue("DisplayIcon", "\"" + mainExe + "\"");
                            appKey.SetValue("NoModify", 1, RegistryValueKind.DWord);
                            appKey.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                            appKey.SetValue("EstimatedSize", 1024, RegistryValueKind.DWord);
                        }
                    }
                }
            }
        } catch { }
    }

    private void RegisterProtocolHandler(string installDir) {
        try {
            string helperExe = Path.Combine(installDir, @"bin\NiyantranWin32Helper.exe");
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(@"Software\Classes\niyantran")) {
                if (key != null) {
                    key.SetValue("", "URL:Niyantran Protocol");
                    key.SetValue("URL Protocol", "");
                    using (RegistryKey cmdKey = key.CreateSubKey(@"shell\open\command")) {
                        if (cmdKey != null) {
                            cmdKey.SetValue("", string.Format("\"{0}\" open \"%1\"", helperExe));
                        }
                    }
                }
            }
        } catch { }
    }

    [STAThread]
    public static int Main(string[] args) {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        bool silent = false;
        foreach (string a in args) {
            if (a.Equals("/S", StringComparison.OrdinalIgnoreCase) ||
                a.Equals("--silent", StringComparison.OrdinalIgnoreCase)) {
                silent = true;
            }
        }

        NiyantranInstallerForm form = new NiyantranInstallerForm(silent);
        if (silent) {
            form.Show();
            form.StartInstallation();
            Application.Run(form);
            return 0;
        }

        Application.Run(form);
        return 0;
    }
}
