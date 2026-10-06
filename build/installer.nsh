; Personnalisation de l'installateur DigiPlan (NSIS).

; La fonction du raccourci Bureau n'est référencée que par la page de fin de l'installateur :
; lors de la compilation du désinstallateur, NSIS la signale comme inutilisée (avertissement 6010).
!pragma warning disable 6010

!macro customHeader
  !ifndef BUILD_UNINSTALLER
    ; Case à cocher « Créer un raccourci sur le Bureau » sur la page de fin.
    !define MUI_FINISHPAGE_SHOWREADME ""
    !define MUI_FINISHPAGE_SHOWREADME_TEXT "Créer un raccourci sur le Bureau"
    !define MUI_FINISHPAGE_SHOWREADME_FUNCTION DigiPlanCreateDesktopShortcut
  !endif
!macroend

!ifndef BUILD_UNINSTALLER
  Function DigiPlanCreateDesktopShortcut
    CreateShortCut "$DESKTOP\DigiPlan.lnk" "$INSTDIR\DigiPlan.exe" "" "$INSTDIR\DigiPlan.exe" 0
  FunctionEnd
!endif

!macro customUnInstall
  ; Supprime le raccourci Bureau éventuel. Les données (%APPDATA%\DigiPlan) et sauvegardes sont conservées.
  Delete "$DESKTOP\DigiPlan.lnk"
!macroend
