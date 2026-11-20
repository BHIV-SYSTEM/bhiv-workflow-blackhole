; Niyantran Employee Monitoring V2 - NSIS Installer Script
!define PRODUCT_NAME "Niyantran Employee Monitoring V2"
!define PRODUCT_VERSION "2.0.0"
!define PRODUCT_PUBLISHER "Niyantran Engineering"
!define OUT_FILE "NiyantranMonitoringV2Setup.exe"
!define INSTALL_DIR "$LOCALAPPDATA\NiyantranMonitoringV2"

Name "${PRODUCT_NAME}"
OutFile "${OUT_FILE}"
InstallDir "${INSTALL_DIR}"
RequestExecutionLevel user

Page directory
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

Section "MainSection" SEC01
  SetOutPath "$INSTDIR\bin"
  File "..\bin\NiyantranWin32Helper.exe"
  SetOutPath "$INSTDIR\src"
  File /r "..\src\*.*"
  SetOutPath "$INSTDIR"
  File "..\package.json"

  CreateDirectory "$SMPROGRAMS\Niyantran"
  CreateShortcut "$SMPROGRAMS\Niyantran\${PRODUCT_NAME}.lnk" "$INSTDIR\bin\NiyantranWin32Helper.exe" "tray"
  CreateShortcut "$SMPROGRAMS\Niyantran\Uninstall.lnk" "$INSTDIR\uninstall.exe"

  WriteUninstaller "$INSTDIR\uninstall.exe"
SectionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\Niyantran\${PRODUCT_NAME}.lnk"
  Delete "$SMPROGRAMS\Niyantran\Uninstall.lnk"
  RMDir "$SMPROGRAMS\Niyantran"
  RMDir /r "$INSTDIR"
SectionEnd
