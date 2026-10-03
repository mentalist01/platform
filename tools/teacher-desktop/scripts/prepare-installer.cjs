'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const template = path.join(path.dirname(require.resolve('app-builder-lib/package.json')), 'templates/nsis/installSection.nsh');
const anchor = '!include installer.nsh';
const source = fs.readFileSync(template, 'utf8');
if (source.split(anchor).length !== 2) throw new Error('NSIS installer template changed; review the update hook before building');
// Keep the installed directory and shortcuts during in-place upgrades. Calling
// the old uninstaller moves files from D: to its C: temp directory and unpins the
// application during manual upgrades. Default NSIS extraction safely retries
// locked files after its normal application-close check; app data is elsewhere.
const hook = `
!echo "IVAN100: in-place upgrade hook compiled"
!macroundef uninstallOldVersion
!macro uninstallOldVersion ROOT_KEY
  !insertmacro readReg $R8 "\${ROOT_KEY}" "\${INSTALL_REGISTRY_KEY}" InstallLocation
  \${if} $R8 == $INSTDIR
  \${andIf} \${FileExists} "$INSTDIR\\\${APP_EXECUTABLE_FILENAME}"
    StrCpy $keepShortcuts "true"
    StrCpy $R0 0
    ClearErrors
  \${else}
    Push "\${ROOT_KEY}"
    Call uninstallOldVersion
  \${endIf}
!macroend
`;
const destination = path.resolve(root, '../../output/teacher-desktop/nsis/installSection.nsh');
fs.mkdirSync(path.dirname(destination), { recursive: true });
// Keep root template includes beside the patched section: otherwise NSIS may
// pick its built-in MultiUser.nsh instead of the builder's multiUser.nsh.
for (const name of fs.readdirSync(path.dirname(template)).filter(name => name.endsWith('.nsh'))) {
  fs.copyFileSync(path.join(path.dirname(template), name), path.join(path.dirname(destination), name));
}
fs.writeFileSync(destination, source.replace(anchor, anchor + hook));
// makensis starts in the template directory, which otherwise takes precedence
// over added include directories. Resolve our patched section first while
// keeping all the other pinned builder templates available.
fs.writeFileSync(path.join(path.dirname(destination), 'overrides.nsh'),
  `!addincludedir "${path.dirname(template)}"\n!addincludedir "${path.dirname(destination)}"\n!cd "${path.dirname(destination)}"\n`);
console.log('NSIS in-place upgrade and shortcut preservation prepared.');
