
!macro customInit
  Delete "$INSTDIR\Uninstall*.exe"
  StrCpy $INSTDIR "$PROGRAMFILES\econmerce-crawler-app\econmerce-crawler-junpu-52"
!macroend

!macro customRemoveFiles
   DetailPrint "Removing files..."
   RMDir /r $INSTDIR
!macroend

!macro customUnInstallCheck
!macroend
