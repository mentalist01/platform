"""Isolated LibreOffice UNO adapter for the experimental cell-sync protocol.

Uses the Python bundled with LibreOffice; never attaches to the user's profile.
The only documents opened by this adapter are new, blank test workbooks.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import uuid

sys.path.insert(0, str(Path(sys.executable).parent))
if os.name == 'nt':
    _dll_directory = os.add_dll_directory(str(Path(sys.executable).parent))
import uno


def property_value(name, value):
    prop = uno.createUnoStruct('com.sun.star.beans.PropertyValue')
    prop.Name, prop.Value = name, value
    return prop


def normalize_formula(formula, separator):
    # Formula argument separators differ between Excel and UNO. Quoted strings
    # and escaped quote characters must remain byte-for-byte unchanged.
    out, quoted, index = [], False, 0
    while index < len(formula):
        char = formula[index]
        if char == '"':
            if quoted and index + 1 < len(formula) and formula[index + 1] == '"':
                out.extend(['"', '"'])
                index += 2
                continue
            quoted = not quoted
        out.append(separator if not quoted and char in ',;' else char)
        index += 1
    return ''.join(out)


class CalcAdapter:
    def __init__(self, args):
        self.args, self.doc, self.desktop = args, None, None
        self.profile = Path(args.profile).resolve()
        self.profile.mkdir(parents=True, exist_ok=False)
        self.pipe = 'ivan100_live_' + uuid.uuid4().hex
        command = [args.soffice, '-env:UserInstallation=' + self.profile.as_uri(),
                   '--headless' if not args.visible else '--nologo', '--nodefault', '--norestore',
                   '--accept=pipe,name=' + self.pipe + ';urp;StarOffice.ComponentContext']
        self.process = subprocess.Popen(command, stdin=subprocess.DEVNULL,
                                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                        creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        context = uno.getComponentContext()
        resolver = context.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', context)
        end = time.monotonic() + 25
        while True:
            try:
                self.remote = resolver.resolve('uno:pipe,name=' + self.pipe + ';urp;StarOffice.ComponentContext')
                break
            except Exception:
                if time.monotonic() > end:
                    self.process.terminate()
                    raise RuntimeError('LibreOffice could not start its isolated test profile')
                time.sleep(.1)
        self.desktop = self.remote.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop', self.remote)
        self.doc = self.desktop.loadComponentFromURL('private:factory/scalc', '_blank', 0,
            (property_value('Hidden', not args.visible), property_value('MacroExecutionMode', 0)))
        self.sheet = self.doc.Sheets.getByIndex(0)
        self.sheet.Name = 'Live'

    def cell(self, address):
        return self.sheet.getCellRangeByName(address)

    def content(self, cell):
        kind = cell.getType().value
        if kind == 'EMPTY':
            return {'kind': 'empty'}
        if kind == 'VALUE':
            return {'kind': 'number', 'value': cell.getValue()}
        if kind == 'FORMULA':
            return {'kind': 'formula', 'value': normalize_formula(cell.getFormula(), ',')}
        return {'kind': 'text', 'value': cell.getString()}

    def read_cell(self, address):
        cell = self.cell(address)
        color = int(cell.getPropertyValue('CellBackColor'))
        transparent = bool(cell.getPropertyValue('IsCellBackgroundTransparent'))
        return {'content': self.content(cell), 'fill': None if transparent or color < 0 else color}

    def write_property(self, address, key, value):
        cell = self.cell(address)
        if key == 'fill':
            cell.setPropertyValue('IsCellBackgroundTransparent', value is None)
            cell.setPropertyValue('CellBackColor', -1 if value is None else int(value))
        elif key == 'content':
            kind = value['kind']
            if kind == 'number':
                cell.setValue(value['value'])
            elif kind == 'formula':
                cell.setFormula(normalize_formula(value['value'], ';'))
            elif kind == 'text':
                cell.setString(value['value'])
            else:
                cell.setString('')
        else:
            raise ValueError('Unknown cell property')

    def snapshot(self):
        return {address: self.read_cell(address) for address in self.args.addresses}

    def execute(self, command):
        kind = command['type']
        if kind == 'snapshot':
            return {'cells': self.snapshot()}
        if kind in ('edit', 'apply'):
            applied, skipped = [], []
            for change in command['changes']:
                address = change['address']
                if address not in self.args.addresses:
                    raise ValueError('Address outside the experimental range')
                for key in ('content', 'fill'):
                    if key not in change:
                        continue
                    if kind == 'apply' and self.read_cell(address)[key] != change['expected'][key]:
                        skipped.append({'address': address, 'property': key})
                        continue
                    self.write_property(address, key, change[key])
                    applied.append({'address': address, 'property': key})
            return {'applied': applied, 'skipped': skipped}
        if kind == 'evaluate':
            return {'value': self.cell(command['address']).getValue(),
                    'text': self.cell(command['address']).getString(),
                    'error': self.cell(command['address']).getError()}
        if kind == 'save':
            destination = Path(command['path']).resolve()
            self.doc.storeAsURL(destination.as_uri(), (property_value('FilterName', 'calc8'),))
            return {'saved': str(destination)}
        raise ValueError('Unknown adapter command')

    def close(self):
        if self.doc is not None:
            try:
                self.doc.close(True)
            except Exception:
                pass
        if self.desktop is not None:
            try:
                self.desktop.terminate()
            except Exception:
                pass
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.terminate()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--soffice', required=True)
    parser.add_argument('--profile', required=True)
    parser.add_argument('--addresses', default='A1,A2,B1,B2,C1,C2,D1,D2')
    parser.add_argument('--visible', action='store_true')
    args = parser.parse_args()
    args.addresses = args.addresses.split(',')
    adapter = None
    try:
        adapter = CalcAdapter(args)
        print(json.dumps({'ready': True, 'engine': 'LibreOffice', 'addresses': args.addresses}), flush=True)
        for line in sys.stdin:
            command = json.loads(line)
            if command['type'] == 'close':
                break
            try:
                print(json.dumps({'id': command['id'], 'result': adapter.execute(command)}), flush=True)
            except Exception as error:
                print(json.dumps({'id': command['id'], 'error': str(error)}), flush=True)
    finally:
        if adapter:
            adapter.close()


if __name__ == '__main__':
    main()
