using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

public class NiyantranUninstaller {
    [STAThread]
    public static int Main(string[] args) {
        bool isSilent = false;
        foreach (string arg in args) {
            if (arg.Equals("/S", StringComparison.OrdinalIgnoreCase) ||
                arg.Equals("--silent", StringComparison.OrdinalIgnoreCase)) {
                isSilent = true;
            }
        }

        if (!isSilent) {
            DialogResult dr = MessageBox.Show(
                "Are you sure you want to uninstall Niyantran Employee Monitoring V2?\n\nThis will remove the desktop agent, shortcuts, and local monitoring cache.",
                "Uninstall Niyantran Employee Monitoring V2",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question
            );
            if (dr != DialogResult.Yes) {
                return 1;
            }
        }

        string baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
        string installDir = baseDir;
        if (Path.GetFileName(baseDir).Equals("bin", StringComparison.OrdinalIgnoreCase)) {
            installDir = Path.GetDirectoryName(baseDir);
        }

        // 1. Terminate running agent processes
        try {
            Process[] procs = Process.GetProcessesByName("NiyantranWin32Helper");
            foreach (Process p in procs) {
                try { p.Kill(); } catch { }
            }
        } catch { }

        Thread.Sleep(500);

        // 2. Remove Start Menu folder
        try {
            string startMenuDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                @"Microsoft\Windows\Start Menu\Programs\Niyantran"
            );
            if (Directory.Exists(startMenuDir)) {
                Directory.Delete(startMenuDir, true);
            }
        } catch { }

        // 3. Remove Desktop shortcut
        try {
            string desktopDir = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            string desktopShortcut = Path.Combine(desktopDir, "Niyantran Employee Monitoring V2.lnk");
            if (File.Exists(desktopShortcut)) {
                File.Delete(desktopShortcut);
            }
        } catch { }

        // 4. Remove Registry Uninstall entry
        try {
            using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall", true)) {
                if (key != null) {
                    key.DeleteSubKeyTree("NiyantranMonitoringV2", false);
                }
            }
        } catch { }

        // 5. Schedule self-deletion of installation directory via detached cmd
        try {
            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = "cmd.exe";
            psi.Arguments = string.Format("/c timeout /t 2 /nobreak >nul & rmdir /s /q \"{0}\"", installDir);
            psi.WindowStyle = ProcessWindowStyle.Hidden;
            psi.CreateNoWindow = true;
            psi.UseShellExecute = false;
            Process.Start(psi);
        } catch { }

        if (!isSilent) {
            MessageBox.Show(
                "Niyantran Employee Monitoring V2 was successfully removed from your computer.",
                "Uninstallation Complete",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information
            );
        }

        return 0;
    }
}
