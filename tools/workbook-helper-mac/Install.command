#!/bin/bash
set -euo pipefail
umask 077

SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_DIR="$HOME/Library/Application Support/IVAN100WorkbookHelperMac"
APP_DIR="$HOME/Applications"
APP_PATH="$APP_DIR/IVAN100 Таблицы.app"
NODE_VERSION="v22.23.3"
case "$(/usr/bin/uname -m)" in
  arm64) NODE_ARCH="arm64"; NODE_SHA="23b25245dcfb9af7262f8ff142e9e2e0af025368117329e7a7458a51e5922f53" ;;
  x86_64) NODE_ARCH="x64"; NODE_SHA="8a677b0219178efd6eb0e475457c4afb452b521a92f6e67845a73bd85727f2a8" ;;
  *) printf 'Этот Mac не поддерживается. Нужен Intel или Apple Silicon.\n'; exit 1 ;;
esac

fail() { printf '\nНе удалось установить помощник: %s\nСкачивание с сайта вручную остаётся доступным.\n' "$1"; read -r _ 2>/dev/null || true; exit 1; }
trap 'printf "\nУстановка остановлена. Файлы решений сохраняются.\n"' ERR
printf 'IVAN100 · Таблицы · тестовая версия macOS 0.1.0\n'
printf 'Поддерживаются macOS 11 и новее, LibreOffice и Microsoft Excel.\n'
MAC_MAJOR="$(/usr/bin/sw_vers -productVersion | /usr/bin/awk -F. '{print $1}')"
[ "$MAC_MAJOR" -ge 11 ] || fail 'Нужна macOS 11 или новее.'
(cd "$SOURCE_DIR/payload" && /usr/bin/shasum -a 256 -c SHA256SUMS) || fail 'Повреждён архив. Скачайте его заново.'
for TARGET in "$HOME/Library" "$HOME/Library/Application Support" "$INSTALL_DIR" "$INSTALL_DIR/runtime" "$APP_DIR"; do
  [ ! -L "$TARGET" ] || fail 'Папка установки занята ссылкой.'
  if [ -e "$TARGET" ]; then [ -d "$TARGET" ] && [ -O "$TARGET" ] || fail 'Нет доступа к папке установки.'; fi
done

if [ -x "$INSTALL_DIR/runtime/node" ] && [ -f "$APP_PATH/Contents/Resources/helper/index.mjs" ]; then
  "$INSTALL_DIR/runtime/node" "$APP_PATH/Contents/Resources/helper/index.mjs" --check-idle || fail 'Сначала завершите работу помощника через приложение «IVAN100 Таблицы».'
fi

STAGE_DIR="$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/ivan100-install.XXXXXX")"
cleanup() {
  if [ -d "$STAGE_DIR/previous.app" ] && [ ! -e "$APP_PATH" ]; then /bin/mv "$STAGE_DIR/previous.app" "$APP_PATH"; fi
  /bin/rm -rf "$STAGE_DIR"
}
trap cleanup EXIT
NODE_FILE="node-$NODE_VERSION-darwin-$NODE_ARCH.tar.gz"
printf '\nЗагружаю проверенный Node.js %s с nodejs.org…\n' "$NODE_VERSION"
/usr/bin/curl --fail --location --proto '=https' --proto-redir '=https' --tlsv1.2 --connect-timeout 30 --max-time 300 "https://nodejs.org/dist/$NODE_VERSION/$NODE_FILE" --output "$STAGE_DIR/$NODE_FILE" || fail 'Не удалось загрузить Node.js. Проверьте интернет.'
ACTUAL_SHA="$(/usr/bin/shasum -a 256 "$STAGE_DIR/$NODE_FILE" | /usr/bin/awk '{print $1}')"
[ "$ACTUAL_SHA" = "$NODE_SHA" ] || fail 'Контрольная сумма Node.js не совпала.'
/usr/bin/tar -xzf "$STAGE_DIR/$NODE_FILE" -C "$STAGE_DIR"
NODE_PATH="$STAGE_DIR/node-$NODE_VERSION-darwin-$NODE_ARCH/bin/node"
[ "$("$NODE_PATH" --version)" = "$NODE_VERSION" ] || fail 'Не удалось проверить Node.js.'

/bin/mkdir -p "$INSTALL_DIR/runtime" "$APP_DIR"
/bin/chmod 700 "$INSTALL_DIR" "$INSTALL_DIR/runtime"
/bin/cp "$NODE_PATH" "$INSTALL_DIR/runtime/node.new"
/bin/chmod 700 "$INSTALL_DIR/runtime/node.new"
/bin/mv -f "$INSTALL_DIR/runtime/node.new" "$INSTALL_DIR/runtime/node"
STAGED_APP="$STAGE_DIR/IVAN100 Таблицы.app"
/usr/bin/osacompile -o "$STAGED_APP" "$SOURCE_DIR/payload/helper.applescript"
/bin/mkdir -p "$STAGED_APP/Contents/Resources/helper"
/bin/cp "$SOURCE_DIR"/payload/*.mjs "$STAGED_APP/Contents/Resources/helper/"
PLIST="$STAGED_APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleIdentifier ru.ivan100.workbookhelper.mac' "$PLIST" || /usr/libexec/PlistBuddy -c 'Add :CFBundleIdentifier string ru.ivan100.workbookhelper.mac' "$PLIST"
/usr/libexec/PlistBuddy -c 'Set :CFBundleShortVersionString 0.1.0' "$PLIST" || /usr/libexec/PlistBuddy -c 'Add :CFBundleShortVersionString string 0.1.0' "$PLIST"
/usr/libexec/PlistBuddy -c 'Set :CFBundleVersion 1' "$PLIST" || /usr/libexec/PlistBuddy -c 'Add :CFBundleVersion string 1' "$PLIST"
/usr/libexec/PlistBuddy -c 'Add :LSMinimumSystemVersion string 11.0' "$PLIST"
/usr/libexec/PlistBuddy -c 'Add :LSUIElement bool true' "$PLIST"
/usr/libexec/PlistBuddy -c 'Add :CFBundleURLTypes array' "$PLIST"
/usr/libexec/PlistBuddy -c 'Add :CFBundleURLTypes:0 dict' "$PLIST"
/usr/libexec/PlistBuddy -c 'Add :CFBundleURLTypes:0:CFBundleURLName string ru.ivan100.workbookhelper.mac' "$PLIST"
/usr/libexec/PlistBuddy -c 'Add :CFBundleURLTypes:0:CFBundleURLSchemes array' "$PLIST"
/usr/libexec/PlistBuddy -c 'Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string ivan-ege' "$PLIST"
# Locally compiled AppleScript apps need a valid local signature after adding
# resources. This is ad-hoc signing, not an Apple Developer/notarized release.
/usr/bin/codesign --force --sign - "$STAGED_APP" || fail 'macOS не смогла подписать созданное приложение. Проверьте доступность системных средств разработчика или используйте ручное скачивание.'
# Replace only this installer's app after idle verification. Never remove saved
# workbooks or change macOS security settings/quarantine attributes.
if [ -e "$APP_PATH" ]; then
  [ ! -L "$APP_PATH" ] || fail 'Путь приложения занят ссылкой.'
  [ -f "$APP_PATH/Contents/Resources/helper/index.mjs" ] || fail 'Путь приложения занят другим приложением.'
  /bin/mv "$APP_PATH" "$STAGE_DIR/previous.app"
fi
/bin/mv "$STAGED_APP" "$APP_PATH"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP_PATH"
printf '\nГотово. Вернитесь на ivan100.ru и нажмите «Решать».\n'
printf 'Сохраняйте изменения Cmd+S; помощник отправит их на платформу.\n'
printf 'Состояние сохранения: ~/Applications/IVAN100 Таблицы.app.\n'
/usr/bin/open "$APP_PATH"
