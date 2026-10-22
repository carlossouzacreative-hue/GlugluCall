Unicode true
SetCompressor /SOLID lzma

!include "MUI2.nsh"

Name "GlugluCall"
OutFile "/workspace/gluglutelas/convidado/dist/GlugluCall-Setup-1.0.0.exe"
InstallDir "$LOCALAPPDATA\GlugluCall"
RequestExecutionLevel user
Icon "/workspace/gluglutelas/convidado/build/icon.ico"
UninstallIcon "/workspace/gluglutelas/convidado/build/icon.ico"

VIProductVersion "1.0.0.0"
VIAddVersionKey "ProductName" "GlugluCall"
VIAddVersionKey "FileDescription" "Instalador do GlugluCall"
VIAddVersionKey "CompanyName" "Gluglutelas"
VIAddVersionKey "FileVersion" "1.0.0.0"
VIAddVersionKey "LegalCopyright" "Gluglutelas"

!define MUI_ABORTWARNING
!define MUI_ICON "/workspace/gluglutelas/convidado/build/icon.ico"
!define MUI_UNICON "/workspace/gluglutelas/convidado/build/icon.ico"
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "PortugueseBR"

Section
  SetOutPath "$INSTDIR"
  File /r "/workspace/gluglutelas/convidado/dist/win-unpacked/*"
  WriteUninstaller "$INSTDIR\Desinstalar GlugluCall.exe"
  CreateShortcut "$DESKTOP\GlugluCall.lnk" "$INSTDIR\GlugluCall.exe" "" "$INSTDIR\GlugluCall.exe" 0
  CreateShortcut "$SMPROGRAMS\GlugluCall.lnk" "$INSTDIR\GlugluCall.exe" "" "$INSTDIR\GlugluCall.exe" 0
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GlugluCall" "DisplayName" "GlugluCall"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GlugluCall" "UninstallString" "$\"$INSTDIR\Desinstalar GlugluCall.exe$\""
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GlugluCall" "DisplayIcon" "$INSTDIR\GlugluCall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GlugluCall" "Publisher" "Gluglutelas"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GlugluCall" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GlugluCall" "NoRepair" 1
  Exec '"$INSTDIR\GlugluCall.exe"'
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\GlugluCall.lnk"
  Delete "$SMPROGRAMS\GlugluCall.lnk"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\GlugluCall"
  RMDir /r "$INSTDIR"
SectionEnd
