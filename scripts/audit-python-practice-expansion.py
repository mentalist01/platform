"""Execute every authored case with the platform's exact sandbox runner.

Also check prerequisite syntax and test sensitivity to realistic code mutations.
The Node launcher exports PYTHON_RUNNER_SCRIPT; no second Python sandbox is used.
"""
import ast
import base64
import concurrent.futures
import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output'
RUNNER = (OUT / 'python-practice-platform-runner.py').read_text(encoding='utf-8')
TASKS = json.loads((OUT / 'python-practice-expansion-audit-input.json').read_text(encoding='utf-8'))
PAYLOAD = json.loads((ROOT / 'server/pythonPracticeExpansionData.json').read_text(encoding='utf-8'))
PUBLIC = {q['question']['id']:q['question']['tests'] for q in PAYLOAD['questions']}


def exact(value):
    return value.replace('\r\n','\n').rstrip('\n')


def platform_compare(value):
    return ' '.join(value.split())


def execute(code, stdin):
    encoded = base64.b64encode(code.encode('utf-8')).decode('ascii')
    try:
        result = subprocess.run([sys.executable,'-I','-X','utf8','-c',RUNNER,encoded],input=stdin,
                                encoding='utf-8',capture_output=True,timeout=2,
                                env={**os.environ,'PYTHONIOENCODING':'utf-8'})
        return result.returncode, result.stdout, result.stderr[-1000:]
    except subprocess.TimeoutExpired:
        return -1, '', 'timeout'


def prerequisite_errors(task, tree):
    topic = task['topic']
    errors = []
    builtins = {'input','print','int'}
    if topic >= 102: builtins |= {'str','float'}
    if topic >= 104: builtins |= {'abs','min','max','round'}
    if topic >= 105: builtins |= {'range'}
    if topic >= 106: builtins |= {'len'}
    if topic >= 108: builtins |= {'list','map','sum'}
    banned = (ast.Import,ast.ImportFrom,ast.FunctionDef,ast.AsyncFunctionDef,ast.Lambda,
              ast.ClassDef,ast.Dict,ast.Set,ast.Tuple,ast.GeneratorExp,ast.Yield,
              ast.DictComp,ast.SetComp,ast.NamedExpr,ast.Try)
    for node in ast.walk(tree):
        if isinstance(node,banned): errors.append(type(node).__name__)
        if topic < 103 and isinstance(node,(ast.If,ast.IfExp,ast.Compare,ast.BoolOp)):
            errors.append('condition before conditions')
        if topic < 105 and isinstance(node,(ast.For,ast.ListComp)):
            errors.append('loop before for')
        if topic < 106 and isinstance(node,(ast.Subscript,ast.Attribute)):
            errors.append('string indexing/method before strings')
        if topic < 107 and isinstance(node,ast.While): errors.append('while before while')
        if topic < 108 and isinstance(node,(ast.List,ast.ListComp,ast.Starred)):
            errors.append('list before lists')
        if isinstance(node,ast.Call) and isinstance(node.func,ast.Name) and node.func.id not in builtins:
            errors.append('unintroduced function '+node.func.id)
    if topic == 103 and not any(isinstance(n,ast.If) for n in ast.walk(tree)):
        errors.append('missing target if')
    if topic == 105 and not any(isinstance(n,ast.For) for n in ast.walk(tree)):
        errors.append('missing target for')
    if topic == 107 and not any(isinstance(n,ast.While) for n in ast.walk(tree)):
        errors.append('missing target while')
    if task['section']=='Генераторы списков' and not any(isinstance(n,ast.ListComp) for n in ast.walk(tree)):
        errors.append('missing target list comprehension')
    return sorted(set(errors))


def mutants(tree):
    """At most four single-site bugs. Surviving/equivalent mutants are reported."""
    variants = []
    for node in ast.walk(tree):
        replacement = None
        if isinstance(node,ast.Compare):
            mapping = {ast.Lt:ast.LtE,ast.LtE:ast.Lt,ast.Gt:ast.GtE,ast.GtE:ast.Gt,ast.Eq:ast.NotEq,ast.NotEq:ast.Eq}
            if type(node.ops[0]) in mapping:
                replacement = copy.deepcopy(node)
                replacement.ops[0] = mapping[type(node.ops[0])]()
        elif isinstance(node,ast.BinOp) and isinstance(node.op,(ast.Add,ast.Sub)):
            replacement = copy.deepcopy(node)
            replacement.op = ast.Sub() if isinstance(node.op,ast.Add) else ast.Add()
        elif isinstance(node,ast.Constant) and type(node.value) is int and node.value in [0,1]:
            replacement = ast.copy_location(ast.Constant(value=1-node.value),node)
        if replacement is None:
            continue
        # Find the same node in a private tree by its deterministic traversal index.
        nodes = list(ast.walk(tree))
        index = nodes.index(node)
        cloned = copy.deepcopy(tree)
        target = list(ast.walk(cloned))[index]
        class ReplaceCloned(ast.NodeTransformer):
            def generic_visit(self,current):
                return copy.deepcopy(replacement) if current is target else super().generic_visit(current)
        modified = ast.fix_missing_locations(ReplaceCloned().visit(cloned))
        code = ast.unparse(modified)
        if code not in variants:
            variants.append(code)
        if len(variants)>=4:
            break
    return variants


def audit_task(task):
    started = time.monotonic()
    tree = ast.parse(task['reference'])
    errors = prerequisite_errors(task,tree)
    failures = []
    for i,case in enumerate(task['cases']):
        rc,actual,error = execute(task['reference'],case['input'])
        if rc != 0 or exact(actual) != exact(case['output']):
            failures.append({'case':i+1,'input':case['input'],'expected':case['output'],'actual':actual,'error':error})
    tests = PUBLIC[task['id']]
    wrong_constant_rejected = len({platform_compare(t['output']) for t in tests}) > 1
    mutation_count = 0
    killed = 0
    survivors = []
    for code in mutants(tree):
        mutation_count += 1
        rejected = False
        for case in tests:
            rc,actual,_ = execute(code,case['input'])
            if rc != 0 or platform_compare(actual) != platform_compare(case['output']):
                killed += 1
                rejected = True
                break
        if not rejected:
            survivors.append(code)
    return {**{k:task[k] for k in ['id','topic','title','section','learningGoal','prerequisites']},
            'cases':len(task['cases']),'publicCases':len(tests),'syntaxErrors':errors,'failures':failures,
            'constantFirstAnswerRejected':wrong_constant_rejected,
            'mutants':mutation_count,'mutantsRejected':killed,
            'survivingMutants':survivors,
            'seconds':round(time.monotonic()-started,3)}


def main():
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for result in pool.map(audit_task,TASKS):
            results.append(result)
            print(json.dumps({'done':len(results),'topic':result['topic'],'title':result['title'],
                              'cases':result['cases'],'failures':len(result['failures']),'syntaxErrors':result['syntaxErrors']},ensure_ascii=False),flush=True)
    summary = {'questions':len(results),'cases':sum(x['cases'] for x in results),
               'publicCases':sum(x['publicCases'] for x in results),
               'failures':sum(len(x['failures']) for x in results),
               'syntaxErrors':sum(len(x['syntaxErrors']) for x in results),
               'mutants':sum(x['mutants'] for x in results),'mutantsRejected':sum(x['mutantsRejected'] for x in results),
               'constantAnswerTasks':[x['id'] for x in results if not x['constantFirstAnswerRejected']]}
    (OUT/'python-practice-expansion-audit-report.json').write_text(json.dumps({'summary':summary,'tasks':results},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(summary,ensure_ascii=False),flush=True)
    return 1 if summary['failures'] or summary['syntaxErrors'] else 0


if __name__=='__main__':
    raise SystemExit(main())
