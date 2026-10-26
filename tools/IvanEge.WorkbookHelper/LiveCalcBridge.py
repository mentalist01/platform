"""Native Calc bridge for Windows helper. Only opens the explicitly scoped file.

LibreOffice's own Python and UNO API are used; no network listener, no macros,
no access to already open user documents, and no shell-generated commands.
"""
import argparse
import json
import os
import re
from pathlib import Path
import subprocess
import shutil
import sys
import time
import uuid

sys.path.insert(0, str(Path(sys.executable).parent))
_dll = os.add_dll_directory(str(Path(sys.executable).parent))
import uno


def prop(name, value):
    result = uno.createUnoStruct('com.sun.star.beans.PropertyValue')
    result.Name, result.Value = name, value
    return result


class Calc:
    def __init__(self, args):
        self.args, self.doc, self.desktop, self.process = args, None, None, None
        profile = Path(args.profile).resolve()
        profile.mkdir(parents=True, exist_ok=False)
        self.profile = profile
        pipe = 'iv100_' + uuid.uuid4().hex
        self.process = subprocess.Popen([args.soffice, '-env:UserInstallation=' + profile.as_uri(),
            '--headless' if args.hidden else '--nologo', '--nodefault', '--norestore',
            '--accept=pipe,name=' + pipe + ';urp;StarOffice.ComponentContext'],
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW)
        context = uno.getComponentContext()
        resolver = context.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', context)
        deadline = time.monotonic() + 25
        while True:
            try:
                remote = resolver.resolve('uno:pipe,name=' + pipe + ';urp;StarOffice.ComponentContext')
                break
            except Exception:
                if time.monotonic() > deadline:
                    self.process.terminate()
                    raise RuntimeError('Не удалось запустить отдельный профиль LibreOffice')
                time.sleep(.1)
        self.desktop = remote.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop', remote)
        self.doc = self.desktop.loadComponentFromURL(Path(args.file).resolve().as_uri(), '_blank', 0,
            (prop('Hidden', args.hidden), prop('MacroExecutionMode', 0), prop('UpdateDocMode', 0)))
        if not self.doc or not self.doc.supportsService('com.sun.star.sheet.SpreadsheetDocument'):
            raise RuntimeError('Файл не является таблицей LibreOffice')
        self.doc.storeAsURL(Path(args.local).resolve().as_uri(),
            (prop('FilterName', 'Calc MS Excel 2007 XML'), prop('Overwrite', False)))
        self.parser = self.doc.createInstance('com.sun.star.sheet.FormulaParser')
        self.parser.CompileEnglish = True
        self.parser.FormulaConvention = 1  # XL_A1
        # The separator property is absent in LibreOffice 25.8. The Excel
        # opcode map includes the proper argument separator on those versions.
        mapper = self.doc.createInstance('com.sun.star.sheet.FormulaOpCodeMapper')
        self.parser.OpCodeMap = mapper.getAvailableMappings(4, 0x7fffffff)

    def read(self, sheet, address):
        cell = sheet.getCellRangeByName(address)
        kind = cell.getType().value
        if kind == 'EMPTY':
            content = {'kind': 'empty'}
        elif kind == 'VALUE':
            content = {'kind': 'number', 'value': cell.getValue()}
        elif kind == 'TEXT':
            content = {'kind': 'text', 'value': cell.getString()}
        else:
            formula = self.parser.printFormula(cell.getTokens(), cell.getCellAddress())
            expression = formula.lstrip('=')
            content = {'kind': 'boolean', 'value': expression == 'TRUE()'} if expression in ('TRUE()', 'FALSE()') else {'kind': 'formula', 'value': '=' + expression}
        color = cell.getPropertyValue('CellBackColor')
        fill = None if cell.getPropertyValue('IsCellBackgroundTransparent') or color < 0 else int(color)
        return {'content': content, 'fill': fill}

    def write(self, sheet, address, key, value):
        cell = sheet.getCellRangeByName(address)
        if key == 'fill':
            cell.setPropertyValue('IsCellBackgroundTransparent', value is None)
            cell.setPropertyValue('CellBackColor', -1 if value is None else int(value))
        elif value['kind'] == 'empty':
            cell.setString('')
        elif value['kind'] == 'number':
            cell.setValue(value['value'])
        elif value['kind'] == 'text':
            cell.setString(value['value'])
        else:
            formula = value['value'] if value['kind'] == 'formula' else ('=TRUE()' if value['value'] else '=FALSE()')
            cell.setTokens(self.parser.parseFormula(formula.lstrip('='), cell.getCellAddress()))

    def execute(self, command):
        kind = command['type']
        if kind == 'snapshot':
            self.doc.storeToURL(Path(command['path']).resolve().as_uri(),
                (prop('FilterName', 'Calc MS Excel 2007 XML'), prop('Overwrite', True)))
            return {'path': command['path'], 'localPath': uno.fileUrlToSystemPath(self.doc.getURL())}
        if kind == 'save':
            self.doc.store()
            return {'saved': True}
        if kind in ('apply', 'edit'):
            for change in command['changes']:
                sheet = self.doc.Sheets.getByName(change['sheetName'])
                if kind == 'apply' and self.read(sheet, change['address'])[change['property']] != change['expected']:
                    return {'skipped': True}
            self.doc.lockControllers()
            try:
                for change in command['changes']:
                    self.write(self.doc.Sheets.getByName(change['sheetName']), change['address'], change['property'], change['value'])
            finally:
                self.doc.unlockControllers()
            return {'skipped': False}
        if kind == 'replace':
            self.replace(command['book'])
            return {'replaced': True}
        if kind == 'evaluate':
            cell = self.doc.Sheets.getByName(command['sheetName']).getCellRangeByName(command['address'])
            return {'value': cell.getValue(), 'text': cell.getString(), 'error': cell.getError()}
        if kind == 'insert-rows':
            self.doc.Sheets.getByName(command['sheetName']).Rows.insertByIndex(command['row'] - 1, 1)
            return {'inserted': True}
        if kind == 'fill-down':
            self.doc.Sheets.getByName(command['sheetName']).getCellRangeByName(command['range']).fillAuto(uno.Enum('com.sun.star.sheet.FillDirection', 'TO_BOTTOM'), 1)
            return {'filled': True}
        if kind == 'theme-fill':
            self.write(self.doc.Sheets.getByName(command['sheetName']), command['address'], 'fill', 0x8ea9db)
            return {'filled': True}
        if kind == 'load-test-data':
            count = command['count']
            if not 1 <= count <= 100000:
                raise ValueError('Invalid fixture size')
            self.doc.Sheets.getByName(command['sheetName']).getCellRangeByName('R1:R' + str(count)).setDataArray(tuple((float(i + 1),) for i in range(count)))
            return {'loaded': True}
        raise ValueError('Неизвестная команда общей таблицы')

    def replace(self, book):
        sheets = book['sheets']
        self.doc.lockControllers()
        try:
            while self.doc.Sheets.getCount() < len(sheets):
                self.doc.Sheets.insertNewByName('_iv_new_' + uuid.uuid4().hex[:8], self.doc.Sheets.getCount())
            for index in range(self.doc.Sheets.getCount()):
                self.doc.Sheets.getByIndex(index).Name = '_iv_' + uuid.uuid4().hex[:12]
            while self.doc.Sheets.getCount() > len(sheets):
                self.doc.Sheets.removeByName(self.doc.Sheets.getByIndex(self.doc.Sheets.getCount() - 1).Name)
            for index, source in enumerate(sheets):
                sheet = self.doc.Sheets.getByIndex(index)
                sheet.Name = source['name']
                cursor = sheet.createCursor()
                cursor.gotoEndOfUsedArea(True)
                cursor.clearContents(1 | 2 | 4 | 16)
                cursor.setPropertyValue('IsCellBackgroundTransparent', True)
                cursor.setPropertyValue('CellBackColor', -1)
            for source in sheets:
                sheet = self.doc.Sheets.getByName(source['name'])
                def position(address):
                    letters, row = re.fullmatch(r'([A-Z]+)([0-9]+)', address).groups()
                    column = 0
                    for char in letters:
                        column = column * 26 + ord(char) - 64
                    return int(row) - 1, column - 1
                positions = {address: position(address) for address in source['cells']}
                rows = max((p[0] for p in positions.values()), default=-1) + 1
                columns = max((p[1] for p in positions.values()), default=-1) + 1
                bulk = 0 < rows * columns <= 500000
                if bulk:
                    data = [[''] * columns for _ in range(rows)]
                    for address, value in source['cells'].items():
                        content = value['content']
                        if content['kind'] in ('number', 'text'):
                            row, column = positions[address]
                            data[row][column] = content['value']
                    sheet.getCellRangeByPosition(0, 0, columns - 1, rows - 1).setDataArray(tuple(tuple(row) for row in data))
                for address, value in source['cells'].items():
                    if not bulk or value['content']['kind'] in ('formula', 'boolean'):
                        self.write(sheet, address, 'content', value['content'])
                    if value['fill'] is not None:
                        self.write(sheet, address, 'fill', value['fill'])
        finally:
            self.doc.unlockControllers()

    def close(self):
        if self.doc:
            try:
                self.doc.store()
                self.doc.close(True)
            except Exception:
                return  # Keep the live document instead of discarding local work.
        if self.desktop:
            self.desktop.terminate()
        if self.process:
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.terminate()
                self.process.wait(timeout=5)
        if hasattr(self, 'profile') and self.profile.name.startswith('iv100-live-'):
            shutil.rmtree(self.profile, ignore_errors=True)


def main():
    parser = argparse.ArgumentParser()
    for arg in ('file', 'local', 'profile', 'soffice'):
        parser.add_argument('--' + arg, required=True)
    parser.add_argument('--hidden', action='store_true')
    args = parser.parse_args()
    calc = None
    try:
        calc = Calc.__new__(Calc)
        calc.__init__(args)
        print(json.dumps({'ready': True}), flush=True)
        for line in sys.stdin:
            command = json.loads(line)
            if command['type'] == 'close':
                break
            try:
                print(json.dumps({'id': command['id'], 'result': calc.execute(command)}), flush=True)
            except Exception as error:
                closed = False
                try:
                    calc.doc.getURL()
                except Exception:
                    closed = True
                print(json.dumps({'id': command['id'], 'error': str(error), 'closed': closed}), flush=True)
    except Exception as error:
        print(json.dumps({'startupError': str(error)}), flush=True)
        sys.exit(1)
    finally:
        if calc:
            calc.close()


if __name__ == '__main__':
    main()
