import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseAst } from 'rollup/parseAst';

const sections = { PythonSection: 450_000, ProgressSection: 600_000, NotesSection: 650_000 };

export async function verifySectionStartup(directory) {
  const root = path.resolve(directory), modules = new Map();
  const read = async filename => {
    const resolved = path.resolve(root, filename);
    if (!resolved.startsWith(root + path.sep)) throw Error('Asset escaped build directory');
    if (!modules.has(resolved)) {
      const source = await fs.readFile(resolved, 'utf8');
      const dependencies = parseAst(source).body
        .filter(node => ['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) && node.source)
        .map(node => node.source.value).filter(value => value.startsWith('.') && value.endsWith('.js'))
        .map(value => path.relative(root, path.resolve(path.dirname(resolved), value)));
      modules.set(resolved, { source, bytes: Buffer.byteLength(source), dependencies });
    }
    return modules.get(resolved);
  };
  const graph = async (filename, seen = new Set()) => {
    const normalized = path.normalize(filename);
    if (seen.has(normalized)) return seen;
    seen.add(normalized);
    for (const dependency of (await read(normalized)).dependencies) await graph(dependency, seen);
    return seen;
  };
  const html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
  const entry = html.match(/<script[^>]+src="(\/assets\/[^"/]+\.js)"/)?.[1]?.slice(1);
  if (!entry) throw Error('Section startup check: missing entry');
  const entryModule = await read(entry);
  const appName = entryModule.source.match(/import\("\.\/(App-[^"/]+\.js)"\)/)?.[1];
  if (!appName) throw Error('Section startup check: missing App');
  const appFile = path.join('assets', appName), app = await read(appFile), initial = await graph(appFile);
  const report = [];
  for (const [name, budget] of Object.entries(sections)) {
    const filename = app.source.match(new RegExp('"(?:assets/|\\./)(' + name + '-[^"/]+\\.js)"'))?.[1];
    if (!filename) throw Error('Section startup check: missing ' + name);
    const dependencies = await graph(path.join('assets', filename));
    const unwanted = [...dependencies].find(file => /(?:editor-(?:vendor|adapter)|SelfHostedMonacoEditor)-[^/\\]+\.js$/.test(file));
    if (unwanted) throw Error(`${name}: editor eagerly loaded through ${unwanted}`);
    let bytes = 0;
    const required = [...dependencies].filter(file => !initial.has(file));
    for (const file of required) bytes += (await read(file)).bytes;
    if (bytes > budget) throw Error(`${name}: startup budget exceeded: ${bytes} > ${budget}`);
    report.push({ name, bytes, modules: required.map(file => file.replaceAll('\\', '/')) });
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const report = await verifySectionStartup(process.argv[2] || 'dist');
  console.log(JSON.stringify(report, null, 2));
}
