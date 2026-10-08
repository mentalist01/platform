on helperCommand(commandName)
    set appRoot to POSIX path of (path to me)
    set homeRoot to POSIX path of (path to home folder)
    set nodePath to homeRoot & "Library/Application Support/IVAN100WorkbookHelperMac/runtime/node"
    set helperPath to appRoot & "Contents/Resources/helper/index.mjs"
    return quoted form of nodePath & " " & quoted form of helperPath & " " & commandName
end helperCommand

on open location theURL
    try
        do shell script (my helperCommand("--launch")) & " " & quoted form of theURL
    on error
        display dialog "Не удалось открыть таблицу. Откройте «IVAN100 Таблицы» и попробуйте ещё раз с сайта." with title "IVAN100 · Таблицы" buttons {"Понятно"} default button "Понятно"
    end try
end open location

on run
    try
        do shell script (my helperCommand("--show-status"))
    on error
        display dialog "Не удалось запустить помощник. Повторите установку или скачайте файл вручную с платформы." with title "IVAN100 · Таблицы" buttons {"Понятно"} default button "Понятно"
    end try
end run
