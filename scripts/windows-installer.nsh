; Windows installer page: install transcription or not.
;
; Transcription's runtime (resources\speech-runtime, 26 MB) is always in the installer; when
; the box is cleared it is removed right after the files are copied, and the app hides its
; transcription controls (electron/ipc/speechModels.ts hasSpeechRuntime). Silent installs
; keep it unless /NOTRANSCRIPTION is passed. The speech model itself is never installed: the
; app downloads it the first time someone transcribes.
;
; electron-builder compiles this script a second time to make the uninstaller; nothing here
; belongs to that pass, and unused functions there would fail the build (warnings are errors).

!ifndef BUILD_UNINSTALLER

!include nsDialogs.nsh
!include LogicLib.nsh
!include FileFunc.nsh

Var InstallTranscription
Var TranscriptionCheckbox

!macro customInit
  StrCpy $InstallTranscription "1"
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/NOTRANSCRIPTION" $R1
  ${IfNot} ${Errors}
    StrCpy $InstallTranscription "0"
  ${EndIf}
!macroend

; The page's functions are defined where the page is added: by then the installer has
; included its UI library (MUI_HEADER_TEXT), which it hasn't when this file is read.
!macro customPageAfterChangeDir
  Page custom TranscriptionPageCreate TranscriptionPageLeave

Function TranscriptionPageCreate
  !insertmacro MUI_HEADER_TEXT "Transcription" "Choose whether to install speech to text."
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateCheckbox} 0 0 100% 12u "Install transcription (text and subtitles from speech)"
  Pop $TranscriptionCheckbox
  ${If} $InstallTranscription == "1"
    ${NSD_Check} $TranscriptionCheckbox
  ${EndIf}

  ${NSD_CreateLabel} 12u 20u -12u 64u "Turns the speech in a recording into a text transcript and .srt subtitles, on this computer and without uploading anything. It takes 26 MB here; the speech model (250 to 560 MB) is downloaded the first time you transcribe.$\r$\n$\r$\nLeave it unchecked to keep OpenScreen smaller. To add it later, run this installer again."
  Pop $0

  nsDialogs::Show
FunctionEnd

Function TranscriptionPageLeave
  ${NSD_GetState} $TranscriptionCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $InstallTranscription "1"
  ${Else}
    StrCpy $InstallTranscription "0"
  ${EndIf}
FunctionEnd
!macroend

!macro customInstall
  ${If} $InstallTranscription == "0"
    ; Step out of the folder first: Windows won't remove the installer's working folder.
    SetOutPath "$INSTDIR"
    RMDir /r "$INSTDIR\resources\speech-runtime"
  ${EndIf}
!macroend

!endif
