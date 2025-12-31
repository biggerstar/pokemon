
!macro customInit
  Delete "$INSTDIR\Uninstall*.exe"
  StrCpy $INSTDIR "$PROGRAMFILES\pokemon\pokemon"
!macroend

!macro customRemoveFiles
   DetailPrint "Removing files..."
   RMDir /r $INSTDIR
!macroend

!macro customUnInstallCheck
!macroend
