import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
export function snapshotReleaseClient(source, destination, objects) {
  source = fs.realpathSync(source);
  if (fs.existsSync(destination)) throw Error('Snapshot destination already exists');
  fs.mkdirSync(destination, { recursive: true }); fs.mkdirSync(objects, { recursive: true });
  let files = 0, newBytes = 0;
  const copy = (from, to, relative = '') => {
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      const input = path.join(from, entry.name), output = path.join(to, entry.name), name = path.join(relative, entry.name);
      if (entry.isSymbolicLink()) throw Error(`Snapshot refuses symbolic link: ${name}`);
      if (entry.isDirectory()) { fs.mkdirSync(output); copy(input, output, name); continue; }
      if (!entry.isFile()) throw Error(`Snapshot refuses special file: ${name}`);
      files++;
      // Objects are independent of the live dist inode: later publishers may
      // overwrite dist safely without changing an earlier recovery snapshot.
      const digest = hash(input), object = path.join(objects, digest);
      if (!fs.existsSync(object)) {
        const temporary = `${object}.${crypto.randomUUID()}.tmp`;
        fs.copyFileSync(input, temporary, fs.constants.COPYFILE_EXCL);
        if (hash(temporary) !== digest) throw Error(`Source changed during snapshot: ${name}`);
        fs.renameSync(temporary, object); newBytes += fs.statSync(object).size;
      } else if (hash(object) !== digest) throw Error(`Corrupted release object: ${digest}`);
      fs.linkSync(object, output);
    }
  };
  copy(source, destination);
  return { files, newBytes };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [source, destination, objects] = process.argv.slice(2);
  if (!source || !destination || !objects) throw Error('Usage: SOURCE NEW_SNAPSHOT OBJECT_DIRECTORY');
  console.log(JSON.stringify(snapshotReleaseClient(source, destination, objects)));
}
