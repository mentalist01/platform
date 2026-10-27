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
import traceback

sys.path.insert(0, str(Path(sys.executable).parent))
_dll = os.add_dll_directory(str(Path(sys.executable).parent))
import uno
import unohelper
from com.sun.star.util import XModifyListener


def prop(name, value):
    result = uno.createUnoStruct('com.sun.star.beans.PropertyValue')
    result.Name, result.Value = name, value
    return result


class ChangeCounter(unohelper.Base, XModifyListener):
    def __init__(self):
        self.serial = 0

    def modified(self, event):
        self.serial += 1

    def disposing(self, event):
        pass


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
        # Finish loading/converting before exposing a window, so closing or
        # editing a half-open XLS cannot race the startup UNO calls.
        self.doc = self.desktop.loadComponentFromURL(Path(args.file).resolve().as_uri(), '_blank', 0,
            (prop('Hidden', True), prop('MacroExecutionMode', 0), prop('UpdateDocMode', 0)))
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
        if not args.hidden:
            self.doc.getCurrentController().getFrame().getContainerWindow().setVisible(True)
        self.changes = ChangeCounter()
        self.doc.addModifyListener(self.changes)
        self._accessible = None
        self._accessible_at = 0
        self._shape_rectangles = {}

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
        if kind == 'pulse':
            return self.pulse(command.get('peers', []))
        if kind == 'activate':
            self.doc.getCurrentController().getFrame().getContainerWindow().toFront()
            return {'activated': True}
        if kind == 'select':
            sheet = self.doc.Sheets.getByName(command['sheetName'])
            self.doc.getCurrentController().setActiveSheet(sheet)
            areas = command['ranges']
            if len(areas) == 1:
                r1, c1, r2, c2 = areas[0]
                selection = sheet.getCellRangeByPosition(c1, r1, c2, r2)
            else:
                selection = self.doc.createInstance('com.sun.star.sheet.SheetCellRanges')
                for r1, c1, r2, c2 in areas:
                    selection.addRangeAddress(sheet.getCellRangeByPosition(c1, r1, c2, r2).getRangeAddress(), False)
            self.doc.getCurrentController().select(selection)
            return {'selected': True}
        if kind == 'view':
            controller = self.doc.getCurrentController()
            if 'freezeRows' in command:
                controller.freezeAtPosition(command.get('freezeColumns', 0), command['freezeRows'])
            controller.ZoomValue = command['zoom']
            controller.setFirstVisibleRow(command['row'])
            controller.setFirstVisibleColumn(command['column'])
            return {'viewed': True}
        if kind == 'fixture-object':
            shape = self.doc.createInstance('com.sun.star.drawing.RectangleShape')
            shape.Name = command['name']
            point = uno.createUnoStruct('com.sun.star.awt.Point')
            point.X, point.Y = 4000, 3000
            size = uno.createUnoStruct('com.sun.star.awt.Size')
            size.Width, size.Height = 4000, 2000
            shape.Position, shape.Size = point, size
            self.doc.getCurrentController().getActiveSheet().getDrawPage().add(shape)
            self.doc.getCurrentController().select(shape)
            return {'created': True}
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

    def pulse(self, peers):
        controller = self.doc.getCurrentController()
        sheet = controller.getActiveSheet()
        selected = controller.getSelection()
        ranges, objects = [], []
        if hasattr(selected, 'getRangeAddresses'):
            addresses = selected.getRangeAddresses()
        elif hasattr(selected, 'getRangeAddress'):
            addresses = [selected.getRangeAddress()]
        else:
            addresses = []
            shapes = [selected.getByIndex(i) for i in range(min(selected.getCount(), 16))] if hasattr(selected, 'getCount') else [selected]
            for shape in shapes:
                if hasattr(shape, 'getShapeType') and shape.Name:
                    name = ''.join(char for char in str(shape.Name) if ord(char) >= 32)[:120]
                    if name:
                        objects.append({'name': name, 'kind': 'shape'})
        for area in addresses[:16]:
            ranges.append([area.StartRow, area.StartColumn, area.EndRow, area.EndColumn])
        selection = {'sheetName': sheet.Name, 'ranges': ranges, 'objects': objects,
                     'activeCell': ranges[0][:2] if ranges else [0, 0]}
        window = controller.getFrame().getContainerWindow()
        result = {'serial': self.changes.serial, 'watching': True, 'selection': selection,
                  'window': int(window.getWindowHandle((), 1)), 'marks': [], 'view': None}
        if not peers or self.args.hidden:
            return result
        try:
            # LO 25.8+ moved XAccessible off XWindow. The bridge property is
            # provided by LibreOffice itself; older versions expose it directly.
            multiple_panes = controller.getIsWindowSplit() or controller.hasFrozenPanes()
            key = (sheet.Name, sheet.getDrawPage().getCount(), multiple_panes)
            if not self._accessible or self._accessible[0] != key:
                component = controller.getFrame().getComponentWindow()
                try:
                    root = component.getAccessibleContext()
                except AttributeError:
                    root = component.getProperty('XAccessible').getAccessibleContext()
                tables, shapes, pending, budget = [], {}, [(root, 0)], 160
                wanted = {obj['name'] for peer in peers if peer['selection']['sheetName'] == sheet.Name for obj in peer['selection']['objects']}
                while pending and budget:
                    context, depth = pending.pop(0)
                    budget -= 1
                    if context.getAccessibleRole() == 58:  # TABLE; never enumerate its millions of cells.
                        tables.append(context)
                        if not multiple_panes and wanted.issubset(shapes):
                            break
                        continue
                    name = context.getAccessibleName()
                    if name:
                        shapes[name] = context
                    if depth < 8:
                        pending.extend((context.getAccessibleChild(i).getAccessibleContext(), depth + 1)
                                       for i in range(min(context.getAccessibleChildCount(), 32)))
                self._accessible = (key, tables, shapes)
                self._accessible_at = time.monotonic()
            _, tables, shapes = self._accessible
            def rect(context):
                pos, size = context.getLocationOnScreen(), context.getSize()
                return [pos.X, pos.Y, size.Width, size.Height]
            def clipped(value, clip):
                x, y = max(value[0], clip[0]), max(value[1], clip[1])
                right, bottom = min(value[0] + value[2], clip[0] + clip[2]), min(value[1] + value[3], clip[1] + clip[3])
                return [x, y, right - x, bottom - y] if right > x and bottom > y else None
            def shape_rectangle(name, table, viewport):
                page = sheet.getDrawPage()
                shape = next((page.getByIndex(i) for i in range(min(page.getCount(), 500)) if page.getByIndex(i).Name == name), None)
                if shape is None:
                    return None
                position, size = shape.Position, shape.Size
                cache_key = (name, tuple(viewport))
                stamp = (position.X, position.Y, size.Width, size.Height, controller.ZoomValue,
                         controller.getFirstVisibleRow(), controller.getFirstVisibleColumn(), self.changes.serial)
                cached = self._shape_rectangles.get(cache_key)
                if cached and cached[0] == stamp:
                    return cached[1]
                def axis(value, vertical):
                    low, high = 0, 1048575 if vertical else 16383
                    while low < high:
                        mid = (low + high + 1) // 2
                        position = sheet.getCellByPosition(0 if vertical else mid, mid if vertical else 0).Position
                        if (position.Y if vertical else position.X) <= value:
                            low = mid
                        else:
                            high = mid - 1
                    return low
                def point(x, y):
                    column, row = axis(x, False), axis(y, True)
                    cell = sheet.getCellByPosition(column, row)
                    position, size = cell.Position, cell.Size
                    pixels = rect(table.getAccessibleCellAt(row, column).getAccessibleContext())
                    return (round(pixels[0] + (x - position.X) * pixels[2] / max(1, size.Width)),
                            round(pixels[1] + (y - position.Y) * pixels[3] / max(1, size.Height)))
                left, top = point(position.X, position.Y)
                right, bottom = point(position.X + size.Width, position.Y + size.Height)
                bounds = [left, top, right - left, bottom - top]
                if len(self._shape_rectangles) > 128:
                    self._shape_rectangles.clear()
                self._shape_rectangles[cache_key] = (stamp, bounds)
                return bounds
            seen = set()
            for table in tables:
                viewport = rect(table)
                if viewport[2] <= 0 or viewport[3] <= 0 or tuple(viewport) in seen:
                    continue
                seen.add(tuple(viewport))
                if result['view'] is None:
                    result['view'] = viewport
                else:
                    old = result['view']
                    left, top = min(old[0], viewport[0]), min(old[1], viewport[1])
                    result['view'] = [left, top, max(old[0] + old[2], viewport[0] + viewport[2]) - left, max(old[1] + old[3], viewport[1] + viewport[3]) - top]
                for peer in peers[:32]:
                    other = peer['selection']
                    if other['sheetName'] != sheet.Name:
                        continue
                    for r1, c1, r2, c2 in other['ranges'][:16]:
                        first = rect(table.getAccessibleCellAt(r1, c1).getAccessibleContext())
                        last = rect(table.getAccessibleCellAt(r2, c2).getAccessibleContext())
                        bounds = clipped([first[0], first[1], last[0] + last[2] - first[0], last[1] + last[3] - first[1]], viewport)
                        if bounds:
                            result['marks'].append({'bounds': bounds, 'name': peer['name'], 'color': peer['color']})
                    for obj in other['objects'][:16]:
                        # Some Calc versions return stale/zero accessible shape
                        # rectangles after zoom. Map the native drawing bounds
                        # through actual on-screen cells instead.
                        value = shape_rectangle(obj['name'], table, viewport)
                        bounds = clipped(value, viewport) if value else None
                        if bounds:
                            result['marks'].append({'bounds': bounds, 'name': peer['name'], 'color': peer['color']})
        except Exception:
            # Presence must never interrupt cell synchronization or move the
            # user's cursor if an office version cannot provide geometry.
            self._accessible = None
        return result

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
                disconnected = 'URP bridge' in str(error) or 'ConnectionSetupException' in type(error).__name__
                if disconnected:
                    traceback.print_exc(file=sys.stderr)
                print(json.dumps({'id': command['id'], 'error': str(error), 'closed': closed, 'disconnected': disconnected}), flush=True)
                if disconnected:
                    break
    except Exception as error:
        traceback.print_exc(file=sys.stderr)
        print(json.dumps({'startupError': str(error)}), flush=True)
        sys.exit(1)
    finally:
        if calc:
            calc.close()


if __name__ == '__main__':
    main()
