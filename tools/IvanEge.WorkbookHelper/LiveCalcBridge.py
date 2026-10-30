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
import itertools
import ctypes
import tempfile
import zipfile
import xml.etree.ElementTree as ET
from ctypes import wintypes


def screen_transform(hwnd):
    """Convert Calc's own screen units to the overlay's physical pixels.

    Some LibreOffice builds remain system-DPI aware. Their UNO accessibility
    coordinates then stay at the primary monitor's DPI even on another screen.
    A DPI-aware Python process alone cannot change the remote UNO coordinates.
    Read the same window in both awareness contexts; this also handles negative
    monitor origins and points outside the window (clipped ranges/shapes).
    """
    user = ctypes.windll.user32
    user.GetAncestor.argtypes = [wintypes.HWND, wintypes.UINT]
    user.GetAncestor.restype = wintypes.HWND
    user.GetWindowDpiAwarenessContext.argtypes = [wintypes.HWND]
    user.GetWindowDpiAwarenessContext.restype = ctypes.c_void_p
    user.SetThreadDpiAwarenessContext.argtypes = [ctypes.c_void_p]
    user.SetThreadDpiAwarenessContext.restype = ctypes.c_void_p
    user.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
    owner = user.GetAncestor(hwnd, 2) or hwnd
    logical, physical = wintypes.RECT(), wintypes.RECT()
    previous = user.SetThreadDpiAwarenessContext(user.GetWindowDpiAwarenessContext(owner))
    try:
        if not user.GetWindowRect(owner, ctypes.byref(logical)):
            raise RuntimeError('Cannot locate Calc window')
        user.SetThreadDpiAwarenessContext(ctypes.c_void_p(-4))  # PER_MONITOR_AWARE_V2
        if not user.GetWindowRect(owner, ctypes.byref(physical)):
            raise RuntimeError('Cannot locate physical Calc window')
    finally:
        if previous:
            user.SetThreadDpiAwarenessContext(previous)
    logical_box = (logical.left, logical.top, logical.right, logical.bottom)
    physical_box = (physical.left, physical.top, physical.right, physical.bottom)
    sx = (physical.right - physical.left) / max(1, logical.right - logical.left)
    sy = (physical.bottom - physical.top) / max(1, logical.bottom - logical.top)
    def convert(box):
        x, y, width, height = box
        left = round(physical.left + (x - logical.left) * sx)
        top = round(physical.top + (y - logical.top) * sy)
        right = round(physical.left + (x + width - logical.left) * sx)
        bottom = round(physical.top + (y + height - logical.top) * sy)
        return [left, top, right - left, bottom - top]
    return convert, (int(owner), logical_box, physical_box)

sys.path.insert(0, str(Path(sys.executable).parent))
_dll = os.add_dll_directory(str(Path(sys.executable).parent))
import uno
import unohelper
from com.sun.star.util import XModifyListener, XChangesListener


def prop(name, value):
    result = uno.createUnoStruct('com.sun.star.beans.PropertyValue')
    result.Name, result.Value = name, value
    return result


class ChangeCounter(unohelper.Base, XModifyListener, XChangesListener):
    def __init__(self):
        self.serial = 0
        self.ignored = 0
        self.ranges = []
        self.last_range = self.last_modify = self.full = 0

    def modified(self, event):
        if not self.ignored:
            self.serial += 1
            self.last_modify = self.serial

    def changesOccurred(self, event):
        if self.ignored:
            return
        self.serial += 1
        self.last_range = self.serial
        for change in event.Changes:
            try:
                if change.Accessor != 'cell-change':
                    self.full = self.serial
                    continue
                area = change.ReplacedElement.getRangeAddress()
                if (area.EndRow - area.StartRow + 1) * (area.EndColumn - area.StartColumn + 1) > 64:
                    self.full = self.serial
                    continue
                self.ranges.append((self.serial, area))
            except Exception:
                self.full = self.serial
        if len(self.ranges) > 128:
            self.ranges = []
            self.full = self.serial

    def disposing(self, event):
        pass


class RangeCounter(unohelper.Base, XModifyListener):
    def __init__(self, counter, area):
        self.counter, self.area = counter, area

    def modified(self, event):
        if not self.counter.ignored:
            self.counter.serial += 1
            self.counter.ranges.append((self.counter.serial, self.area))
            if len(self.counter.ranges) > 128:
                self.counter.ranges = []
                self.counter.full = self.counter.serial

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
        self._default_format = self.read_format(self.doc.StyleFamilies.getByName('CellStyles').getByName('Default')) if args.formatting else None
        if not args.hidden:
            self.doc.getCurrentController().getFrame().getContainerWindow().setVisible(True)
        self.changes = ChangeCounter()
        self.doc.addModifyListener(self.changes)
        try:
            self.doc.addChangesListener(self.changes)
        except Exception:
            pass  # Older office versions retain bounded full snapshot polling.
        self._cell_watch = None
        self._accessible = None
        self._accessible_at = 0
        self._draft_document = None
        self._draft_input_parent = None
        self._draft_scan_at = 0
        self._draft_origin = None
        self._draft_serial = -1
        self._shape_rectangles = {}

    def read(self, sheet, address, formatting=True):
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
        result = {'content': content, 'fill': fill}
        borders = self.read_borders(sheet, address) if self.args.borders else None
        if borders:
            result['borders'] = borders
        if self.args.formatting and formatting:
            formatting = self.relative_format(self.read_format(cell), self._default_format)
            if formatting:
                result['format'] = formatting
        return result

    def write(self, sheet, address, key, value):
        cell = sheet.getCellRangeByName(address)
        if key == 'format':
            self.write_format(cell, value)
        elif key == 'borders':
            self.write_borders(sheet, address, value)
        elif key == 'fill':
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

    @staticmethod
    def number_format(code):
        code = re.sub(r'\[\$-[a-zA-Z0-9-]+\]', '', code)
        if re.fullmatch(r'(?:general|standard|стандарт|основной|общий)', code, re.I):
            return 'General'
        def token(match):
            value = match[0]
            if value.startswith(('"', '[')):
                return value
            if value.startswith('\\') and len(value) == 2 and not value[1].isalnum():
                return value[1:]
            return value.lower()
        return re.sub(r'"(?:[^"]|"")*"|\[[^\]]*\]|\\.|[^"\[\\]+', token, code)

    def read_format(self, cell):
        def enum(value):
            return getattr(value, 'value', value)
        font = {'name': cell.CharFontName, 'size': round(float(cell.CharHeight), 2),
                'color': max(0, int(cell.CharColor)), 'bold': cell.CharWeight >= 150,
                'italic': enum(cell.CharPosture) != 'NONE',
                'underline': {1: 'single', 2: 'double'}.get(int(cell.CharUnderline), 'none'),
                'strike': int(cell.CharStrikeout) != 0}
        defaults = {'name': 'Calibri', 'size': 11, 'color': 0, 'bold': False,
                    'italic': False, 'underline': 'none', 'strike': False}
        rotation = int(cell.RotateAngle) // 100
        if rotation > 180:
            rotation -= 360
        alignment = {'horizontal': {'LEFT': 'left', 'CENTER': 'center', 'RIGHT': 'right',
                                   'BLOCK': 'justify', 'REPEAT': 'fill'}.get(enum(cell.HoriJustify), 'general'),
                     'vertical': {1: 'top', 2: 'center', 4: 'justify'}.get(int(cell.VertJustify), 'bottom'),
                     'wrap': bool(cell.IsTextWrapped), 'shrink': bool(cell.ShrinkToFit),
                     'rotation': 255 if enum(cell.Orientation) == 'STACKED' else rotation}
        standard = {'horizontal': 'general', 'vertical': 'bottom', 'wrap': False, 'shrink': False, 'rotation': 0}
        result = {}
        font = {key: value for key, value in font.items() if value != defaults[key]}
        alignment = {key: value for key, value in alignment.items() if value != standard[key]}
        if font:
            result['font'] = font
        if alignment:
            result['alignment'] = alignment
        code = self.number_format(self.doc.NumberFormats.getByKey(cell.NumberFormat).FormatString)
        if code != 'General':
            result['numberFormat'] = code
        return result or None

    @staticmethod
    def resolve_format(value, defaults):
        result = {key: dict(fields) if isinstance(fields, dict) else fields for key, fields in (defaults or {}).items()}
        for key, fields in (value or {}).items():
            if isinstance(fields, dict):
                result.setdefault(key, {}).update(fields)
            else:
                result[key] = fields
        return result

    @classmethod
    def relative_format(cls, value, defaults):
        standard = {'font': {'name': 'Calibri', 'size': 11, 'color': 0, 'bold': False, 'italic': False, 'underline': 'none', 'strike': False},
                    'alignment': {'horizontal': 'general', 'vertical': 'bottom', 'wrap': False, 'shrink': False, 'rotation': 0}, 'numberFormat': 'General'}
        actual, baseline = cls.resolve_format(value, standard), cls.resolve_format(defaults, standard)
        result = {}
        for key, fields in actual.items():
            if isinstance(fields, dict):
                changed = {name: field for name, field in fields.items() if field != baseline[key].get(name)}
                if changed:
                    result[key] = changed
            elif fields != baseline.get(key):
                result[key] = fields
        return result or None

    def write_format(self, cell, value, absolute=False):
        value = (value or {}) if absolute else self.resolve_format(value, self._default_format)
        font, align = value.get('font', {}), value.get('alignment', {})
        cell.CharFontName = font.get('name', 'Calibri')
        cell.CharHeight = float(font.get('size', 11))
        cell.CharColor = font.get('color', 0)
        cell.CharWeight = float(150 if font.get('bold') else 100)
        cell.CharPosture = uno.Enum('com.sun.star.awt.FontSlant', 'ITALIC' if font.get('italic') else 'NONE')
        cell.CharUnderline = {'single': 1, 'double': 2}.get(font.get('underline'), 0)
        cell.CharStrikeout = 1 if font.get('strike') else 0
        cell.HoriJustify = uno.Enum('com.sun.star.table.CellHoriJustify',
            {'left': 'LEFT', 'center': 'CENTER', 'right': 'RIGHT', 'justify': 'BLOCK', 'fill': 'REPEAT'}.get(align.get('horizontal'), 'STANDARD'))
        cell.VertJustify = {'top': 1, 'center': 2, 'justify': 4}.get(align.get('vertical'), 3)
        cell.IsTextWrapped = align.get('wrap', False)
        cell.ShrinkToFit = align.get('shrink', False)
        rotation = align.get('rotation', 0)
        cell.Orientation = uno.Enum('com.sun.star.table.CellOrientation', 'STACKED' if rotation == 255 else 'STANDARD')
        cell.RotateAngle = 0 if rotation == 255 else (rotation % 360) * 100
        locale = uno.createUnoStruct('com.sun.star.lang.Locale')
        locale.Language, locale.Country = 'en', 'US'
        code = value.get('numberFormat', 'General')
        formats = self.doc.NumberFormats
        key = formats.queryKey(code, locale, True)
        cell.NumberFormat = key if key >= 0 else formats.addNew(code, locale)

    def write_formats(self, sheet, entries):
        # Apply common styles to compact native areas, not through a dozen UNO
        # calls per cell in a 30,000-cell teaching file.
        groups = {}
        for address, value in entries.items():
            key = json.dumps(value, sort_keys=True)
            groups.setdefault(key, []).append(self.border_position(address))
        sheet_index = sheet.getCellRangeByName('A1').getCellAddress().Sheet
        for key, positions in groups.items():
            columns, runs = {}, []
            for column, row in positions:
                columns.setdefault(column, []).append(row)
            for column, rows in columns.items():
                rows = sorted(set(rows)); start = end = rows[0]
                for row in rows[1:]:
                    if row == end + 1:
                        end = row
                    else:
                        runs.append((column, start, end)); start = end = row
                runs.append((column, start, end))
            groups_by_row, rectangles = {}, []
            for column, first, last in runs:
                groups_by_row.setdefault((first, last), []).append(column)
            for (first, last), columns in groups_by_row.items():
                columns.sort(); start = end = columns[0]
                for column in columns[1:] + [None]:
                    if column == end + 1:
                        end = column
                    else:
                        area = uno.createUnoStruct('com.sun.star.table.CellRangeAddress')
                        area.Sheet, area.StartColumn, area.EndColumn = sheet_index, start, end
                        area.StartRow, area.EndRow = first, last
                        rectangles.append(area)
                        start = end = column
            for start in range(0, len(rectangles), 100):
                ranges = self.doc.createInstance('com.sun.star.sheet.SheetCellRanges')
                ranges.addRangeAddresses(tuple(rectangles[start:start + 100]), False)
                self.write_format(ranges, json.loads(key))

    def read_metadata(self, formats=()):
        # Merge discovery from a native export avoids a COM/UNO call per cell
        # in a large sheet. It runs only for an actual layout patch.
        with tempfile.TemporaryDirectory(prefix='iv100-layout-') as directory:
            file = Path(directory) / 'layout.xlsx'
            self.execute({'type': 'snapshot', 'path': str(file)})
            with zipfile.ZipFile(file) as archive:
                ns = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
                rel = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'
                links = {item.attrib['Id']: item.attrib['Target'] for item in ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
                result, values, style_cache = {}, {}, {}
                for sheet in ET.fromstring(archive.read('xl/workbook.xml')).find(ns + 'sheets'):
                    path = links[sheet.attrib[rel]].replace('\\', '/')
                    path = path.lstrip('/') if path.startswith('/') else 'xl/' + path
                    document = ET.fromstring(archive.read(path))
                    merges = sorted({item.attrib['ref'] for item in document.iter(ns + 'mergeCell')})
                    result[sheet.attrib['name']] = {'merges': merges} if merges else None
                    wanted = {change['address'] for change in formats if change['sheetName'] == sheet.attrib['name']}
                    nodes = {item.attrib['r']: item for item in document.iter(ns + 'c') if item.attrib['r'] in wanted}
                    present = {address: item.attrib.get('s', '0') for address, item in nodes.items()}
                    native = self.doc.Sheets.getByName(sheet.attrib['name'])
                    for address in wanted:
                        if address in present and present[address] not in style_cache:
                            style_cache[present[address]] = self.relative_format(self.read_format(native.getCellRangeByName(address)), self._default_format)
                        values[(native.Name, address)] = style_cache[present[address]] if address in present else None
                        if address in present and len(nodes[address]) == 0 and values[(native.Name, address)] is None:
                            cell = self.read(native, address, False)
                            if cell['content']['kind'] == 'empty' and cell['fill'] is None and not cell.get('borders'):
                                values[(native.Name, address)] = None
                return result, values

    @staticmethod
    def merge(sheet, layout, enabled):
        for address in (layout or {}).get('merges', []):
            sheet.getCellRangeByName(address).merge(enabled)

    @staticmethod
    def border_position(address):
        letters, row = re.fullmatch(r'([A-Z]+)([0-9]+)', address).groups()
        col = 0
        for char in letters:
            col = col * 26 + ord(char) - 64
        return col - 1, int(row) - 1

    @staticmethod
    def border_pick(a, b):
        weights = {'hair': 1, 'thin': 2, 'dotted': 2, 'dashed': 2, 'dashDot': 2, 'dashDotDot': 2, 'medium': 3, 'mediumDashed': 3, 'mediumDashDot': 3, 'mediumDashDotDot': 3, 'slantDashDot': 3, 'thick': 4, 'double': 5}
        return max((line for line in (a, b) if line), key=lambda line: (weights[line['style']], json.dumps(line, separators=(',', ':'))), default=None)

    def read_border_edge(self, cell, edge):
        line = cell.getPropertyValue(edge.capitalize() + 'Border2')
        width = int(line.LineWidth) or int(line.OuterLineWidth + line.InnerLineWidth + line.LineDistance)
        if line.LineStyle == 32767 or width == 0:
            return None
        # Match Calc's XLSX export thresholds (0.75 / 1.75 / 2.5pt).
        # Otherwise an exported dashed line may read as dotted and conditional
        # application would incorrectly refuse later changes.
        width = int(line.OuterLineWidth) or width
        medium, hair = width >= 62, width < 26
        style = {1: 'slantDashDot' if medium else 'dotted', 2: 'mediumDashed' if medium else 'dotted' if hair else 'dashed', 14: 'slantDashDot' if medium else 'dashed', 15: 'double', 16: 'mediumDashDot' if medium else 'dashed' if hair else 'dashDot', 17: 'mediumDashDotDot' if medium else 'dashed' if hair else 'dashDotDot'}.get(int(line.LineStyle))
        if style is None:
            style = 'thick' if width >= 88 else 'medium' if medium else 'hair' if hair else 'thin'
        return {'style': style, 'color': int(line.Color) & 0xffffff}

    def read_borders(self, sheet, address):
        col, row = self.border_position(address)
        cell, result = sheet.getCellByPosition(col, row), {}
        for edge in ('left', 'right', 'top', 'bottom'):
            if edge == 'left' and col > 0 or edge == 'top' and row > 0:
                continue
            line = self.read_border_edge(cell, edge)
            if edge == 'right' and col < 16383:
                line = self.border_pick(line, self.read_border_edge(sheet.getCellByPosition(col + 1, row), 'left'))
            if edge == 'bottom' and row < 1048575:
                line = self.border_pick(line, self.read_border_edge(sheet.getCellByPosition(col, row + 1), 'top'))
            if line:
                result[edge] = line
        return result or None

    def write_border_edge(self, cell, edge, value):
        line = uno.createUnoStruct('com.sun.star.table.BorderLine2')
        line.LineStyle = 32767
        if value:
            style = value['style']
            line.Color = value['color']
            line.LineStyle = {'dotted': 1, 'dashed': 2, 'mediumDashed': 2, 'double': 15, 'dashDot': 16, 'mediumDashDot': 16, 'dashDotDot': 17, 'mediumDashDotDot': 17, 'slantDashDot': 1}.get(style, 0)
            line.LineWidth = 18 if style == 'hair' else 89 if style == 'thick' else 63 if style.startswith('medium') or style in ('slantDashDot', 'double') else 27
        cell.setPropertyValue(edge.capitalize() + 'Border2', line)

    def write_borders(self, sheet, address, value):
        col, row = self.border_position(address)
        cell = sheet.getCellByPosition(col, row)
        for edge in ('left', 'right', 'top', 'bottom'):
            if edge == 'left' and col > 0 or edge == 'top' and row > 0:
                continue
            line = (value or {}).get(edge)
            self.write_border_edge(cell, edge, line)
            if edge == 'right' and col < 16383:
                self.write_border_edge(sheet.getCellByPosition(col + 1, row), 'left', line)
            if edge == 'bottom' and row < 1048575:
                self.write_border_edge(sheet.getCellByPosition(col, row + 1), 'top', line)

    def execute(self, command):
        kind = command['type']
        if kind == 'read-cell':
            sheet = self.doc.Sheets.getByName(command['sheetName'])
            cell = sheet.getCellRangeByName(command['address'])
            raw = {}
            for edge in ('left', 'right', 'top', 'bottom'):
                line = cell.getPropertyValue(edge.capitalize() + 'Border2')
                raw[edge] = {key: int(getattr(line, key)) for key in ('LineStyle', 'LineWidth', 'OuterLineWidth', 'InnerLineWidth', 'LineDistance', 'Color')}
            return {'cell': self.read(sheet, command['address']), 'raw': raw}
        if kind == 'pulse':
            result = self.pulse(command.get('peers', []))
            selected = self.doc.getCurrentController().getSelection()
            area = selected.getRangeAddress() if hasattr(selected, 'getRangeAddress') else None
            key = (area.Sheet, area.StartRow, area.StartColumn, area.EndRow, area.EndColumn) if area else None
            if self._cell_watch and self._cell_watch[0] != key:
                self._cell_watch[1].removeModifyListener(self._cell_watch[2])
                self._cell_watch = None
            if key and not self._cell_watch and (area.EndRow - area.StartRow + 1) * (area.EndColumn - area.StartColumn + 1) <= 64:
                listener = RangeCounter(self.changes, area)
                selected.addModifyListener(listener)
                self._cell_watch = (key, selected, listener)
            since = command.get('sinceSerial', -1)
            if since >= self.changes.full:
                cells = {}
                for serial, area in self.changes.ranges:
                    if serial <= since:
                        continue
                    sheet = self.doc.Sheets.getByIndex(area.Sheet)
                    for row in range(area.StartRow, area.EndRow + 1):
                        for col in range(area.StartColumn, area.EndColumn + 1):
                            positions = ((col, row), (max(0, col - 1), row), (col, max(0, row - 1))) if self.args.borders else ((col, row),)
                            for x, y in positions:
                                cell = sheet.getCellByPosition(x, y)
                                address = cell.AbsoluteName.split('.')[-1].replace('$', '')
                                value = self.read(sheet, address, False)
                                known = self.args.formatting and (value['content']['kind'] != 'empty' or value['fill'] is not None or bool(value.get('borders')))
                                if known:
                                    formatting = self.relative_format(self.read_format(cell), self._default_format)
                                    if formatting:
                                        value['format'] = formatting
                                cells[(sheet.Name, address)] = {'sheetName': sheet.Name, 'address': address, 'value': value, 'formatKnown': known}
                if 0 < len(cells) <= 64:
                    result['cells'] = list(cells.values())
            return result
        if kind == 'activate':
            self.doc.getCurrentController().getFrame().getContainerWindow().toFront()
            return {'activated': True}
        if kind == 'fixture-title':
            self.doc.getCurrentController().getFrame().setTitle(command['title'])
            return {'titled': True}
        if kind == 'fixture-quiet-format':
            self.changes.ignored += 1
            try:
                self.write(self.doc.Sheets.getByName(command['sheetName']), command['address'], 'format', command['value'])
            finally:
                self.changes.ignored -= 1
            return {'formatted': True}
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
        if kind == 'viewport':
            controller = self.doc.getCurrentController()
            return {'row': controller.getFirstVisibleRow(), 'column': controller.getFirstVisibleColumn(), 'zoom': controller.ZoomValue}
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
            view = self.capture_view()
            self.changes.ignored += 1
            try:
                self.doc.storeToURL(Path(command['path']).resolve().as_uri(),
                    (prop('FilterName', 'Calc MS Excel 2007 XML'), prop('Overwrite', True)))
            finally:
                self.restore_view(view)
                self.changes.ignored -= 1
            return {'path': command['path'], 'localPath': uno.fileUrlToSystemPath(self.doc.getURL())}
        if kind == 'format-defaults':
            self._default_format = command.get('value')
            return {'updated': True}
        if kind == 'save':
            view = self.capture_view()
            self.changes.ignored += 1
            try:
                self.doc.store()
            finally:
                self.restore_view(view)
                self.changes.ignored -= 1
            return {'saved': True}
        if kind in ('apply', 'edit'):
            formatting = [change for change in command['changes'] if change['property'] == 'format']
            layouts, formats = self.read_metadata(formatting) if formatting or any(change['property'] == 'layout' for change in command['changes']) else ({}, {})
            for change in command['changes']:
                sheet = self.doc.Sheets.getByName(change['sheetName'])
                actual = None if kind != 'apply' else layouts.get(sheet.Name) if change['property'] == 'layout' else formats.get((sheet.Name, change['address'])) if change['property'] == 'format' else self.read(sheet, change['address'], False).get(change['property'])
                if kind == 'apply' and actual != change['expected']:
                    return {'skipped': True}
            self.doc.lockControllers()
            if kind == 'apply':
                self.changes.ignored += 1
            try:
                for change in command['changes']:
                    if change['property'] == 'layout':
                        self.merge(self.doc.Sheets.getByName(change['sheetName']), layouts.get(change['sheetName']), False)
                for change in command['changes']:
                    if change['property'] != 'layout':
                        self.write(self.doc.Sheets.getByName(change['sheetName']), change['address'], change['property'], change['value'])
                for change in command['changes']:
                    if change['property'] == 'layout':
                        self.merge(self.doc.Sheets.getByName(change['sheetName']), change['value'], True)
            finally:
                self.doc.unlockControllers()
                if kind == 'apply':
                    self.changes.ignored -= 1
            return {'skipped': False}
        if kind == 'replace':
            self.replace(command['book'], command.get('previous'))
            return {'replaced': True}
        if kind == 'filter':
            self.apply_filter(self.doc.Sheets.getByName(command['sheetName']), command.get('filter'))
            return {'filtered': True}
        if kind == 'filters':
            view = self.capture_view()
            self.changes.ignored += 1
            self.doc.lockControllers()
            try:
                for item in command['filters']:
                    self.apply_filter(self.doc.Sheets.getByName(item['sheetName']), item.get('value'))
            finally:
                self.doc.unlockControllers()
                self.restore_view(view)
                self.changes.ignored -= 1
            return {'filtered': True}
        if kind == 'sort':
            target = self.doc.Sheets.getByName(command['sheetName']).getCellRangeByName(command['range'])
            field = uno.createUnoStruct('com.sun.star.table.TableSortField')
            field.Field, field.IsAscending = target.getRangeAddress().StartColumn + command['column'], command.get('ascending', True)
            target.sort((prop('SortFields', uno.Any('[]com.sun.star.table.TableSortField', (field,))), prop('ContainsHeader', command.get('header', True)), prop('IsSortColumns', False)))
            return {'sorted': True}
        if kind == 'evaluate':
            cell = self.doc.Sheets.getByName(command['sheetName']).getCellRangeByName(command['address'])
            return {'value': cell.getValue(), 'text': cell.getString(), 'error': cell.getError()}
        if kind == 'insert-rows':
            self.doc.Sheets.getByName(command['sheetName']).Rows.insertByIndex(command['row'] - 1, 1)
            return {'inserted': True}
        if kind == 'fill-down':
            self.doc.Sheets.getByName(command['sheetName']).getCellRangeByName(command['range']).fillAuto(uno.Enum('com.sun.star.sheet.FillDirection', 'TO_BOTTOM'), 1)
            return {'filled': True}
        if kind == 'fill-right':
            self.doc.Sheets.getByName(command['sheetName']).getCellRangeByName(command['range']).fillAuto(uno.Enum('com.sun.star.sheet.FillDirection', 'TO_RIGHT'), 1)
            return {'filled': True}
        if kind == 'move-range':
            sheet = self.doc.Sheets.getByName(command['sheetName'])
            sheet.moveRange(sheet.getCellRangeByName(command['destination']).getCellAddress(), sheet.getCellRangeByName(command['range']).getRangeAddress())
            return {'moved': True}
        if kind == 'theme-fill':
            self.write(self.doc.Sheets.getByName(command['sheetName']), command['address'], 'fill', 0x8ea9db)
            return {'filled': True}
        if kind == 'load-test-data':
            count = command['count']
            if not 1 <= count <= 100000:
                raise ValueError('Invalid fixture size')
            self.doc.Sheets.getByName(command['sheetName']).getCellRangeByName('R1:R' + str(count)).setDataArray(tuple((float(i + 1),) for i in range(count)))
            return {'loaded': True}
        if kind == 'load-filter-data':
            count = command['count']
            sheet = self.doc.Sheets.getByName(command['sheetName'])
            sheet.getCellRangeByName('AF1:AH' + str(count + 1)).setDataArray(
                (('Number', 'Group', 'Pair'),) + tuple((float(count - i), float(i % 3), float((count - i) * 10)) for i in range(count)))
            return {'loaded': True}
        raise ValueError('Неизвестная команда общей таблицы')

    @staticmethod
    def accessible_state(context, name):
        state = context.getAccessibleStateSet()
        flag = uno.getConstantByName('com.sun.star.accessibility.AccessibleStateType.' + name)
        # LO 25.8 exposes a bitmask; earlier releases use XAccessibleStateSet.
        return bool(state & flag) if isinstance(state, int) else state.contains(flag)

    def draft(self, controller, selection):
        if self.args.hidden:
            return None
        try:
            if self._draft_document is None and time.monotonic() >= self._draft_scan_at:
                self._draft_scan_at = time.monotonic() + 2
                component = controller.getFrame().getComponentWindow()
                try:
                    root = component.getAccessibleContext()
                except AttributeError:
                    root = component.getProperty('XAccessible').getAccessibleContext()
                pending, budget = [(root, 0)], 160
                while pending and budget:
                    context, depth = pending.pop(0); budget -= 1
                    role = context.getAccessibleRole()
                    if role == 84:  # DOCUMENT_SPREADSHEET: inspect only its direct editor child.
                        self._draft_document = context
                        continue
                    if depth >= 11 or role in (35, 34, 58, 59):
                        continue  # Never enumerate the cell grid, menus or unrelated documents.
                    for index in range(min(context.getAccessibleChildCount(), 32)):
                        child = context.getAccessibleChild(index).getAccessibleContext()
                        if child.getAccessibleRole() == 61:  # TEXT, formula input line.
                            self._draft_input_parent = (context, index)
                        else:
                            pending.append((child, depth + 1))
            editors = []
            if self._draft_document is not None:
                for index in range(min(self._draft_document.getAccessibleChildCount(), 8)):
                    context = self._draft_document.getAccessibleChild(index).getAccessibleContext()
                    if context.getAccessibleRole() == 61:
                        match = re.search(r'\b([A-Z]{1,3})([1-9][0-9]*)$', context.getAccessibleName())
                        if match:
                            column = 0
                            for char in match[1]: column = column * 26 + ord(char) - 64
                            editors.append((context, [int(match[2]) - 1, column - 1]))
            if self._draft_input_parent:
                parent, index = self._draft_input_parent
                editors.append((parent.getAccessibleChild(index).getAccessibleContext(), None))
            for context, address in editors:
                if self.accessible_state(context, 'DEFUNC') or not self.accessible_state(context, 'SHOWING'):
                    continue
                paragraphs, focused = [], False
                for index in range(min(context.getAccessibleChildCount(), 64)):
                    paragraph = context.getAccessibleChild(index).getAccessibleContext()
                    if paragraph.getAccessibleRole() == 41:
                        focused = focused or self.accessible_state(paragraph, 'FOCUSED')
                        paragraphs.append(paragraph.getText())
                # A formula bar outside edit mode must not expose a saved value
                # as a fresh draft. A native cell editor exists only during edit.
                if not paragraphs or (address is None and not focused):
                    continue
                if self._draft_origin is None or self._draft_serial != self.changes.serial or (address is not None and address != self._draft_origin[1]):
                    self._draft_origin = (selection['sheetName'], address or selection['activeCell'])
                self._draft_serial = self.changes.serial
                sheet, cell = self._draft_origin
                return {'sheetName': sheet, 'cell': cell, 'text': '\n'.join(paragraphs)[:4096]}
            self._draft_origin = None
        except Exception:
            self._draft_document = self._draft_input_parent = self._draft_origin = None
        return None

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
        result['draft'] = self.draft(controller, selection)
        if not peers or self.args.hidden:
            return result
        try:
            # LO 25.8+ moved XAccessible off XWindow. The bridge property is
            # provided by LibreOffice itself; older versions expose it directly.
            multiple_panes = controller.getIsWindowSplit() or controller.hasFrozenPanes()
            to_screen, geometry = screen_transform(result['window'])
            key = (sheet.Name, sheet.getDrawPage().getCount(), multiple_panes, geometry)
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
                return to_screen([pos.X, pos.Y, size.Width, size.Height])
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
                    draft = peer.get('draft')
                    if draft and draft['sheetName'] == sheet.Name:
                        row, column = draft['cell']
                        bounds = clipped(rect(table.getAccessibleCellAt(row, column).getAccessibleContext()), viewport)
                        if bounds:
                            result['marks'].append({'bounds': bounds, 'name': peer['name'], 'color': peer['color'], 'draft': draft['text']})
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

    def capture_view(self):
        controller = self.doc.getCurrentController()
        return controller, controller.getActiveSheet(), controller.getFirstVisibleRow(), controller.getFirstVisibleColumn(), controller.ZoomValue

    def restore_view(self, view):
        controller, sheet, row, column, zoom = view
        # Exporting to XLSX may scroll to the active cell in Calc. Keep the
        # viewport local; never import a peer's view or move our selection.
        if controller.getActiveSheet() != sheet:
            controller.setActiveSheet(sheet)
        if controller.ZoomValue != zoom:
            controller.ZoomValue = zoom
        if controller.getFirstVisibleRow() != row:
            controller.setFirstVisibleRow(row)
        if controller.getFirstVisibleColumn() != column:
            controller.setFirstVisibleColumn(column)

    def apply_filter(self, sheet, state):
        databases = self.doc.DatabaseRanges
        unnamed = None
        try:
            unnamed = self.doc.getPropertyValue('UnnamedDatabaseRanges')
            if unnamed.hasByTable(sheet.getRangeAddress().Sheet):
                database = unnamed.getByTable(sheet.getRangeAddress().Sheet)
                database.AutoFilter = False
                database.getFilterDescriptor().setFilterFields3(())
        except AttributeError:
            pass
        for name in databases.getElementNames():
            database = databases.getByName(name)
            if database.getDataArea().Sheet == sheet.getRangeAddress().Sheet:
                database.AutoFilter = False
                descriptor = database.getFilterDescriptor()
                descriptor.setFilterFields3(())
                area = database.getDataArea()
                sheet.getCellRangeByPosition(area.StartColumn, area.StartRow, area.EndColumn, area.EndRow).filter(descriptor)
        cursor = sheet.createCursor()
        cursor.gotoEndOfUsedArea(True)
        # Imported Excel autofilters can be anonymous database ranges, absent
        # from DatabaseRanges.getElementNames(). Clear the actual filtered flag
        # on the data range as well as ordinary manually hidden row visibility.
        clear = cursor.createFilterDescriptor(True)
        clear.ContainsHeader = False
        clear.setFilterFields(())
        cursor.filter(clear)
        last_row = cursor.getRangeAddress().EndRow
        if state and state['hiddenRows']:
            last_row = max(last_row, state['hiddenRows'][-1][1] - 1)
        sheet.getCellRangeByPosition(0, 0, 0, last_row).Rows.IsVisible = True
        if not state:
            return
        if state.get('range'):
            target = sheet.getCellRangeByName(state['range'])
            if unnamed is not None:
                unnamed.setByTable(target.getRangeAddress())
                database = unnamed.getByTable(sheet.getRangeAddress().Sheet)
            else:
                name = '_IvanLiveFilter_' + str(sheet.getRangeAddress().Sheet)
                if databases.hasByName(name):
                    database = databases.getByName(name)
                    database.setDataArea(target.getRangeAddress())
                else:
                    databases.addNewByName(name, target.getRangeAddress())
                database = databases.getByName(name)
            database.AutoFilter = True
            descriptor = database.getFilterDescriptor()
            descriptor.ContainsHeader = True
            descriptor.IsCaseSensitive = False
            fields = []
            operators = {'equal': 2, 'notEqual': 3, 'greaterThan': 4, 'greaterThanOrEqual': 5, 'lessThan': 6, 'lessThanOrEqual': 7}
            for column in state['columns']:
                tests = column['tests']
                # Excel's value checklist maps to one UNO field with many values.
                if all(test['operator'] == 'equal' and test['value'] != '' for test in tests) and not column['and']:
                    groups = [tests]
                else:
                    groups = [[test] for test in tests]
                for index, group in enumerate(groups):
                    field = uno.createUnoStruct('com.sun.star.sheet.TableFilterField3')
                    field.Field = column['column']
                    test = group[0]
                    field.Operator = operators[test['operator']]
                    if test['value'] == '' and test['operator'] in ('equal', 'notEqual'):
                        field.Operator = 0 if test['operator'] == 'equal' else 1
                    field.Connection = uno.Enum('com.sun.star.sheet.FilterConnection', 'AND' if index == 0 or column['and'] else 'OR')
                    values = []
                    for test in group:
                        value = uno.createUnoStruct('com.sun.star.sheet.FilterFieldValue')
                        value.StringValue = test['value']
                        try:
                            value.NumericValue = float(test['value'])
                            value.IsNumeric = True
                            value.FilterType = 0
                        except ValueError:
                            value.IsNumeric = False
                            value.FilterType = 1
                        values.append(value)
                    field.Values = tuple(values)
                    fields.append(field)
            # XSheetFilterable.filter copies only the legacy Fields2 interface
            # (even in current Calc), truncating Fields3.Values to its first
            # item. Apply an equivalent DNF with singleton predicates, then
            # retain the full Fields3 descriptor for native UI and XLSX export.
            alternatives = [[column['tests']] if column['and'] else [[test] for test in column['tests']] for column in state['columns']]
            combinations = 1
            for choices in alternatives:
                combinations *= len(choices)
            if combinations <= 4096:
                native_fields = []
                for combination in itertools.product(*alternatives):
                    first = True
                    for column, tests in zip(state['columns'], combination):
                        for test in tests:
                            field = uno.createUnoStruct('com.sun.star.sheet.TableFilterField2')
                            field.Field = column['column']
                            field.Operator = operators[test['operator']]
                            if test['value'] == '' and test['operator'] in ('equal', 'notEqual'):
                                field.Operator = 0 if test['operator'] == 'equal' else 1
                            field.Connection = uno.Enum('com.sun.star.sheet.FilterConnection', 'OR' if first and native_fields else 'AND')
                            field.StringValue = test['value']
                            try:
                                field.NumericValue = float(test['value'])
                                field.IsNumeric = True
                            except ValueError:
                                field.IsNumeric = False
                            native_fields.append(field)
                            first = False
                native = target.createFilterDescriptor(True)
                native.ContainsHeader = True
                native.IsCaseSensitive = False
                native.setFilterFields2(tuple(native_fields))
                target.filter(native)
            elif not state['hiddenRows']:
                raise ValueError('Слишком много сочетаний условий фильтра. Выберите меньше значений.')
            if unnamed is not None:
                database = unnamed.getByTable(sheet.getRangeAddress().Sheet)
            database.AutoFilter = True
            descriptor = database.getFilterDescriptor()
            descriptor.ContainsHeader = True
            descriptor.IsCaseSensitive = False
            descriptor.setFilterFields3(tuple(fields))
        # Native filtering normally produces exactly the requested visibility.
        # Avoid thousands of redundant UNO calls for alternating hidden rows.
        if state['hiddenRows']:
            column = 0
            while not sheet.Columns.getByIndex(column).IsVisible:
                column += 1
            visible = sheet.getCellRangeByPosition(column, 0, column, last_row).queryVisibleCells().getRangeAddresses()
            hidden, next_row = [], 1
            for area in sorted(visible, key=lambda item: item.StartRow):
                if area.StartRow + 1 > next_row:
                    hidden.append([next_row, area.StartRow])
                next_row = area.EndRow + 2
            if next_row <= last_row + 1:
                hidden.append([next_row, last_row + 1])
            if hidden != state['hiddenRows']:
                for first, last in state['hiddenRows']:
                    sheet.getCellRangeByPosition(0, first - 1, 0, last - 1).Rows.IsVisible = False

    def replace(self, book, previous=None):
        sheets = book['sheets']
        view = self.capture_view()
        self.changes.ignored += 1
        self.doc.lockControllers()
        try:
            if self.args.formatting:
                if self._default_format != book.get('defaultFormat'):
                    self.write_format(self.doc.StyleFamilies.getByName('CellStyles').getByName('Default'), book.get('defaultFormat'), absolute=True)
                self._default_format = book.get('defaultFormat')
            while self.doc.Sheets.getCount() < len(sheets):
                self.doc.Sheets.insertNewByName('_iv_new_' + uuid.uuid4().hex[:8], self.doc.Sheets.getCount())
            names_changed = self.doc.Sheets.getCount() != len(sheets) or any(self.doc.Sheets.getByIndex(i).Name != source['name'] for i, source in enumerate(sheets))
            if names_changed:
                for index in range(self.doc.Sheets.getCount()):
                    self.doc.Sheets.getByIndex(index).Name = '_iv_' + uuid.uuid4().hex[:12]
            while self.doc.Sheets.getCount() > len(sheets):
                self.doc.Sheets.removeByName(self.doc.Sheets.getByIndex(self.doc.Sheets.getCount() - 1).Name)
            for index, source in enumerate(sheets):
                sheet = self.doc.Sheets.getByIndex(index)
                if sheet.Name != source['name']:
                    sheet.Name = source['name']
                prior = previous['sheets'][index] if previous and index < len(previous['sheets']) else None
                if self.args.formatting:
                    self.merge(sheet, (prior or {}).get('layout'), False)
                cursor = sheet.createCursor()
                cursor.gotoEndOfUsedArea(True)
                cursor.clearContents(1 | 2 | 4 | 16)
                if prior:
                    for address, cell in prior['cells'].items():
                        if cell.get('borders'):
                            self.write(sheet, address, 'borders', None)
                        if cell['fill'] is not None:
                            self.write(sheet, address, 'fill', None)
                    if self.args.formatting:
                        self.write_formats(sheet, {address: None for address, cell in prior['cells'].items() if cell.get('format')})
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
                for address, value in source['cells'].items():
                    if value.get('borders'):
                        self.write(sheet, address, 'borders', value['borders'])
                if self.args.formatting:
                    self.write_formats(sheet, {address: cell['format'] for address, cell in source['cells'].items() if cell.get('format')})
                    self.merge(sheet, source.get('layout'), True)
                self.apply_filter(sheet, source.get('filter'))
        finally:
            self.doc.unlockControllers()
            self.restore_view(view)
            self.changes.ignored -= 1

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
    parser.add_argument('--borders', action='store_true')
    parser.add_argument('--formatting', action='store_true')
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
