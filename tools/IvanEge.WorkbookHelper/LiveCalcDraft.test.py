"""Run with LibreOffice's bundled Python; uses fake scoped contexts, no windows."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest

spec = importlib.util.spec_from_file_location('calc_bridge', Path(__file__).with_name('LiveCalcBridge.py'))
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


class Context:
    def __init__(self, role, name='', text='', children=(), state=16777216 | 64 | 32):
        self.role, self.name, self.text, self.children, self.state = role, name, text, list(children), state
        self.enumerated = False

    def getAccessibleContext(self): return self
    def getAccessibleRole(self): return self.role
    def getAccessibleName(self): return self.name
    def getAccessibleStateSet(self): return self.state
    def getAccessibleChildCount(self):
        self.enumerated = True
        if self.role == 58: raise AssertionError('Cell grid must never be enumerated')
        return len(self.children)
    def getAccessibleChild(self, index): return self.children[index]
    def getText(self): return self.text


class DraftTests(unittest.TestCase):
    def setUp(self):
        self.table = Context(58)
        self.document = Context(84, children=[self.table])
        self.input = Context(61, state=16)  # Defunct formula line outside editing.
        self.parent = Context(40, children=[self.input])
        self.root = Context(40, children=[self.document, self.parent])
        frame = SimpleNamespace(getComponentWindow=lambda: self.root)
        self.controller = SimpleNamespace(getFrame=lambda: frame)
        self.calc = bridge.Calc.__new__(bridge.Calc)
        self.calc.args = SimpleNamespace(hidden=False)
        self.calc.changes = SimpleNamespace(serial=0)
        self.calc._draft_document = self.calc._draft_input_parent = self.calc._draft_origin = None
        self.calc._draft_scan_at = 0
        self.calc._draft_serial = -1
        self.selection = {'sheetName': 'Sheet1', 'activeCell': [0, 0]}

    def read(self): return self.calc.draft(self.controller, self.selection)
    def edit(self, address, text):
        self.document.children = [self.table, Context(61, 'Cell ' + address, children=[Context(41, text=text, state=16777216 | 64 | 32 | 1024)])]

    def test_unconfirmed_text_and_cancel_never_enumerate_the_grid(self):
        self.edit('A1', 'draft')
        self.assertEqual(self.read()['text'], 'draft')
        self.assertFalse(self.table.enumerated)
        self.document.children = [self.table]
        self.assertIsNone(self.read())

    def test_rapid_move_to_another_editor_updates_the_anchor(self):
        self.edit('A1', 'first'); self.assertEqual(self.read()['cell'], [0, 0])
        self.edit('G3', 'next'); self.calc.changes.serial += 1
        self.assertEqual(self.read()['cell'], [2, 6])

    def test_focused_formula_input_and_reference_pointing_keep_the_original_cell(self):
        self.input.state = 16777216 | 64 | 32
        self.input.children = [Context(41, text='=SUM(', state=16777216 | 64 | 32 | 1024)]
        self.assertEqual(self.read()['cell'], [0, 0])
        self.selection['activeCell'] = [5, 5]
        self.assertEqual(self.read()['cell'], [0, 0])
        self.input.children[0].state &= ~1024
        self.assertIsNone(self.read())

    def test_draft_length_is_bounded(self):
        self.edit('A1', 'x' * 10000)
        self.assertEqual(len(self.read()['text']), 4096)


if __name__ == '__main__': unittest.main()
