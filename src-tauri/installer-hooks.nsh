; Legacy rename bridge: AI Quota Monitor (v0.1.0) -> Quota Nexus (v0.1.1+).
; The installer's previous-version detection keys on PRODUCTNAME under
; Uninstall\{ProductName}, so after the rename it cannot see v0.1.0 and
; both versions would coexist. Uninstall the legacy app before installing.
; NOTE: tested against the real v0.1.0 uninstaller - /P alone removes the
; app files, its own uninstall.exe and the install directory. Passing _?=
; (quoted or not) breaks the removal, so it is intentionally omitted.
!macro NSIS_HOOK_PREINSTALL
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AI Quota Monitor" "UninstallString"
  ${If} $R0 == ""
    ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\AI Quota Monitor" "UninstallString"
  ${EndIf}
  ${If} $R0 != ""
    ; Legacy app may be running in the tray; kill it and let handles release.
    ExecWait 'TaskKill /IM "ai-quota-monitor.exe" /F'
    Sleep 800
    ; Tauri's uninstaller is compiled without SilentInstall, so /S is
    ; silently ignored; /P shows a brief progress window and auto-completes.
    ExecWait '$R0 /P' $R4
    ${If} $R4 != 0
      DetailPrint "Legacy AI Quota Monitor uninstaller exited with code $R4"
    ${EndIf}
  ${EndIf}
!macroend
