"""Run both realistic student solutions through the platform sandbox.

Reuse the first batch's prerequisite and mutation checks. Report question counts
separately from solutions so two solutions cannot be mistaken for two tasks.
"""
import importlib.util
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.argv=[sys.argv[0],
    '--input',str(ROOT/'output/python-second-expansion-audit-input.json'),
    '--payload',str(ROOT/'server/pythonSecondExpansionData.json'),
    '--report',str(ROOT/'output/python-second-expansion-audit-report.json')]
spec=importlib.util.spec_from_file_location('base_audit',ROOT/'scripts/audit-python-practice-expansion.py')
audit=importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
# Match the live checker's token comparison: trailing spaces from a common
# print(..., end=" ") loop are valid student output.
audit.exact=audit.platform_compare
questions=audit.TASKS
audit.TASKS=[{**task,'reference':code,'title':task['title']+f' · решение {i+1}'}
             for task in questions for i,code in enumerate(task['studentSolutions'])]
result=audit.main()
report=json.loads(audit.OPTIONS.report.read_text(encoding='utf-8'))
report['summary']['solutions']=report['summary']['questions']
report['summary']['questions']=len(questions)
audit.OPTIONS.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report['summary'],ensure_ascii=False),flush=True)
raise SystemExit(result)
