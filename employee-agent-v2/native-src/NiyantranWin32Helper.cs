using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Windows.Forms;

public class NiyantranWin32Helper {
    // -------------------------------------------------------------
    // Win32 API Imports
    // -------------------------------------------------------------
    [DllImport("user32.dll")]
    static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", SetLastError = true)]
    static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, uint dwProcessId);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool QueryFullProcessImageName(IntPtr hProcess, uint dwFlags, StringBuilder lpExeName, ref uint lpdwSize);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool CloseHandle(IntPtr hObject);

    [StructLayout(LayoutKind.Sequential)]
    struct LASTINPUTINFO {
        public uint cbSize;
        public uint dwTime;
    }

    [DllImport("user32.dll")]
    static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);

    [DllImport("kernel32.dll")]
    static extern uint GetTickCount();

    [DllImport("user32.dll", SetLastError = true)]
    static extern IntPtr OpenInputDesktop(uint dwFlags, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll", SetLastError = true)]
    static extern bool CloseDesktop(IntPtr hDesktop);

    const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
    const uint DESKTOP_SWITCHDESKTOP = 0x0100;

    // Friendly App Name Dictionary
    static readonly Dictionary<string, string> KnownAppNames = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase) {
        { "code.exe", "Visual Studio Code" },
        { "devenv.exe", "Visual Studio" },
        { "chrome.exe", "Google Chrome" },
        { "msedge.exe", "Microsoft Edge" },
        { "firefox.exe", "Mozilla Firefox" },
        { "slack.exe", "Slack" },
        { "teams.exe", "Microsoft Teams" },
        { "ms-teams.exe", "Microsoft Teams" },
        { "notepad.exe", "Notepad" },
        { "notepad++.exe", "Notepad++" },
        { "windowsterminal.exe", "Windows Terminal" },
        { "powershell.exe", "PowerShell" },
        { "pwsh.exe", "PowerShell Core" },
        { "cmd.exe", "Command Prompt" },
        { "explorer.exe", "Windows Explorer" },
        { "excel.exe", "Microsoft Excel" },
        { "winword.exe", "Microsoft Word" },
        { "powerpnt.exe", "Microsoft PowerPoint" },
        { "postman.exe", "Postman" },
        { "figma.exe", "Figma" },
        { "git-bash.exe", "Git Bash" },
        { "docker desktop.exe", "Docker Desktop" },
        { "spotify.exe", "Spotify" },
        { "zoom.exe", "Zoom" }
    };

    // -------------------------------------------------------------
    // Foreground Application & Idle Sampling
    // -------------------------------------------------------------
    public static string SampleForegroundAndIdle() {
        IntPtr hwnd = GetForegroundWindow();
        uint pid = 0;
        if (hwnd != IntPtr.Zero) {
            GetWindowThreadProcessId(hwnd, out pid);
        }

        string rawExe = "Unknown";
        if (pid > 0) {
            IntPtr hProc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
            if (hProc != IntPtr.Zero) {
                StringBuilder sb = new StringBuilder(1024);
                uint size = (uint)sb.Capacity;
                if (QueryFullProcessImageName(hProc, 0, sb, ref size)) {
                    rawExe = Path.GetFileName(sb.ToString());
                }
                CloseHandle(hProc);
            }
        }

        // Idle detection
        LASTINPUTINFO lii = new LASTINPUTINFO();
        lii.cbSize = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO));
        uint idleMs = 0;
        if (GetLastInputInfo(ref lii)) {
            uint tick = GetTickCount();
            if (tick >= lii.dwTime) {
                idleMs = tick - lii.dwTime;
            }
        }

        // Lock detection
        bool isLocked = false;
        IntPtr hDesktop = OpenInputDesktop(0, false, DESKTOP_SWITCHDESKTOP);
        if (hDesktop == IntPtr.Zero) {
            isLocked = true;
        } else {
            CloseDesktop(hDesktop);
        }

        string friendlyName = rawExe;
        if (KnownAppNames.ContainsKey(rawExe)) {
            friendlyName = KnownAppNames[rawExe];
        } else if (rawExe.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) {
            friendlyName = rawExe.Substring(0, rawExe.Length - 4);
        }

        string isoTime = DateTime.UtcNow.ToString("o");
        return string.Format(
            "{{\"success\":true,\"exeName\":\"{0}\",\"appName\":\"{1}\",\"pid\":{2},\"idleMs\":{3},\"isLocked\":{4},\"timestamp\":\"{5}\"}}",
            EscapeJson(rawExe),
            EscapeJson(friendlyName),
            pid,
            idleMs,
            isLocked ? "true" : "false",
            isoTime
        );
    }

    // -------------------------------------------------------------
    // Windows DPAPI Implementation
    // -------------------------------------------------------------
    public static int DpapiProtect(string plaintext) {
        try {
            byte[] bytes = Encoding.UTF8.GetBytes(plaintext);
            byte[] cipher = ProtectedData.Protect(bytes, null, DataProtectionScope.CurrentUser);
            Console.WriteLine(Convert.ToBase64String(cipher));
            return 0;
        } catch (Exception ex) {
            Console.Error.WriteLine("DPAPI Protect Error: " + ex.Message);
            return 1;
        }
    }

    public static int DpapiUnprotect(string base64Cipher) {
        try {
            byte[] cipher = Convert.FromBase64String(base64Cipher.Trim());
            byte[] bytes = ProtectedData.Unprotect(cipher, null, DataProtectionScope.CurrentUser);
            Console.WriteLine(Encoding.UTF8.GetString(bytes));
            return 0;
        } catch (Exception ex) {
            Console.Error.WriteLine("DPAPI Unprotect Error: " + ex.Message);
            return 1;
        }
    }

    static string EscapeJson(string s) {
        if (string.IsNullOrEmpty(s)) return "";
        return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "\\r");
    }

    // -------------------------------------------------------------
    // Main Dispatcher
    // -------------------------------------------------------------
    [STAThread]
    public static int Main(string[] args) {
        if (args.Length == 0 || args[0] == "sample") {
            Console.WriteLine(SampleForegroundAndIdle());
            return 0;
        }

        string command = args[0].ToLowerInvariant();

        if (command == "stream") {
            int intervalMs = 1000;
            if (args.Length > 1) {
                int.TryParse(args[1], out intervalMs);
                if (intervalMs < 100) intervalMs = 100;
            }

            // Stream samples until process killed or stdin closed
            while (true) {
                Console.WriteLine(SampleForegroundAndIdle());
                Thread.Sleep(intervalMs);
            }
        }

        if (command == "dpapi-protect") {
            if (args.Length < 2) {
                Console.Error.WriteLine("Error: Missing plaintext argument for dpapi-protect");
                return 1;
            }
            return DpapiProtect(args[1]);
        }

        if (command == "dpapi-unprotect") {
            if (args.Length < 2) {
                Console.Error.WriteLine("Error: Missing base64 ciphertext argument for dpapi-unprotect");
                return 1;
            }
            return DpapiUnprotect(args[1]);
        }

        if (command == "tray") {
            return RunTrayApplication(args);
        }

        Console.Error.WriteLine("Unknown command: " + command);
        return 1;
    }

    // -------------------------------------------------------------
    // Native Windows System Tray UI
    // -------------------------------------------------------------
    static int RunTrayApplication(string[] args) {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        string sessionStatus = "Waiting for Authorization";
        string deviceId = "DEV-WIN32-UNKNOWN";
        if (args.Length > 1) deviceId = args[1];

        NotifyIcon trayIcon = new NotifyIcon();
        trayIcon.Text = "Niyantran Employee Monitoring V2";
        trayIcon.Icon = SystemIcons.Shield; // Standard clean shield icon
        trayIcon.Visible = true;

        ContextMenuStrip menu = new ContextMenuStrip();

        ToolStripMenuItem headerItem = new ToolStripMenuItem("Niyantran Employee Monitoring V2");
        headerItem.Font = new Font(headerItem.Font, FontStyle.Bold);
        headerItem.Enabled = false;

        ToolStripMenuItem statusItem = new ToolStripMenuItem("Status: " + sessionStatus);
        statusItem.Enabled = false;

        ToolStripMenuItem deviceItem = new ToolStripMenuItem("Device: " + deviceId);
        deviceItem.Enabled = false;

        ToolStripSeparator sep0 = new ToolStripSeparator();

        ToolStripMenuItem miniWinItem = new ToolStripMenuItem("🖥 Open Mini Desktop Window");
        miniWinItem.Font = new Font(miniWinItem.Font, FontStyle.Bold);
        miniWinItem.Click += delegate {
            try {
                Process.Start(new ProcessStartInfo("http://127.0.0.1:48120/mini") { UseShellExecute = true });
            } catch (Exception ex) {
                Console.WriteLine("{\"event\":\"LOG\",\"error\":\"" + ex.Message + "\"}");
            }
        };

        ToolStripMenuItem webDashItem = new ToolStripMenuItem("🌐 Open Web Dashboard");
        webDashItem.Click += delegate {
            try {
                Process.Start(new ProcessStartInfo("http://localhost:5173/monitoring-v2/employee") { UseShellExecute = true });
            } catch (Exception ex) {
                Console.WriteLine("{\"event\":\"LOG\",\"error\":\"" + ex.Message + "\"}");
            }
        };

        ToolStripSeparator sep1 = new ToolStripSeparator();

        ToolStripMenuItem startItem = new ToolStripMenuItem("▶ Start Monitoring Session");
        startItem.Click += delegate {
            Console.WriteLine("{\"event\":\"TRAY_ACTION\",\"action\":\"START\"}");
            statusItem.Text = "Status: ACTIVE_MONITORING";
            trayIcon.ShowBalloonTip(3000, "Monitoring Started", "Employee Monitoring V2 active. Tracking foreground app durations only.", ToolTipIcon.Info);
        };

        ToolStripMenuItem pauseItem = new ToolStripMenuItem("⏸ Pause Monitoring (Break)");
        pauseItem.Click += delegate {
            Console.WriteLine("{\"event\":\"TRAY_ACTION\",\"action\":\"PAUSE\"}");
            statusItem.Text = "Status: PAUSED";
            trayIcon.ShowBalloonTip(3000, "Monitoring Paused", "Session paused. No telemetry will be accumulated until resumed.", ToolTipIcon.Warning);
        };

        ToolStripMenuItem resumeItem = new ToolStripMenuItem("▶ Resume Monitoring");
        resumeItem.Click += delegate {
            Console.WriteLine("{\"event\":\"TRAY_ACTION\",\"action\":\"RESUME\"}");
            statusItem.Text = "Status: ACTIVE_MONITORING";
            trayIcon.ShowBalloonTip(3000, "Monitoring Resumed", "Session resumed.", ToolTipIcon.Info);
        };

        ToolStripMenuItem endItem = new ToolStripMenuItem("⏹ End Monitoring Session");
        endItem.Click += delegate {
            Console.WriteLine("{\"event\":\"TRAY_ACTION\",\"action\":\"END\"}");
            statusItem.Text = "Status: STOPPED";
            trayIcon.ShowBalloonTip(3000, "Session Ended", "Monitoring ended. Final metrics flushed.", ToolTipIcon.Info);
        };

        ToolStripSeparator sep2 = new ToolStripSeparator();

        ToolStripMenuItem privacyItem = new ToolStripMenuItem("🛡 Privacy Transparency Details...");
        privacyItem.Click += delegate {
            MessageBox.Show(
                "NIYANTRAN EMPLOYEE MONITORING V2 — PRIVACY NOTICE\n\n" +
                "1. Foreground App Names & Durations: Tracked ONLY during authorized work sessions.\n" +
                "2. Keystroke Frequencies: Numeric counts only. ZERO characters or text saved.\n" +
                "3. Window Titles: STRICTLY PROHIBITED and never recorded.\n" +
                "4. Browser URLs & Tabs: STRICTLY PROHIBITED and never recorded.\n" +
                "5. Screenshots: STRICTLY PROHIBITED and disabled.\n" +
                "6. Clipboard: STRICTLY PROHIBITED and never accessed.\n\n" +
                "Protected by Windows DPAPI and cryptographic HMAC signing.",
                "Niyantran V2 Privacy Transparency",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information
            );
        };

        ToolStripMenuItem exitItem = new ToolStripMenuItem("✕ Exit Agent");
        exitItem.Click += delegate {
            Console.WriteLine("{\"event\":\"TRAY_ACTION\",\"action\":\"EXIT\"}");
            trayIcon.Visible = false;
            trayIcon.Dispose();
            Application.Exit();
        };

        menu.Items.Add(headerItem);
        menu.Items.Add(statusItem);
        menu.Items.Add(deviceItem);
        menu.Items.Add(sep0);
        menu.Items.Add(miniWinItem);
        menu.Items.Add(webDashItem);
        menu.Items.Add(sep1);
        menu.Items.Add(startItem);
        menu.Items.Add(pauseItem);
        menu.Items.Add(resumeItem);
        menu.Items.Add(endItem);
        menu.Items.Add(sep2);
        menu.Items.Add(privacyItem);
        menu.Items.Add(exitItem);

        trayIcon.DoubleClick += delegate {
            try {
                Process.Start(new ProcessStartInfo("http://127.0.0.1:48120/mini") { UseShellExecute = true });
            } catch (Exception) {}
        };

        trayIcon.ContextMenuStrip = menu;

        // Background reader for stdin events from Node.js
        Thread stdinThread = new Thread(delegate() {
            string line;
            while ((line = Console.ReadLine()) != null) {
                if (line.Trim().Length == 0) continue;
                if (line.Contains("\"UPDATE_STATUS\"")) {
                    // Node parent asks to update status
                    trayIcon.Text = "Niyantran V2 (Active)";
                } else if (line.Contains("\"QUIT\"")) {
                    trayIcon.Visible = false;
                    trayIcon.Dispose();
                    Application.Exit();
                    break;
                }
            }
        });
        stdinThread.IsBackground = true;
        stdinThread.Start();

        Console.WriteLine("{\"event\":\"TRAY_READY\",\"status\":\"OK\"}");
        Application.Run();
        return 0;
    }
}
