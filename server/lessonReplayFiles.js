import fs from 'node:fs/promises';

// A successful upload must have reached the filesystem before the client is
// allowed to discard its local copy. Callers atomically rename this new file.
export async function writeDurableReplayFile(file, contents) {
  const handle = await fs.open(file, 'wx', 0o600);
  try {
    await handle.writeFile(contents);
    await handle.sync();
  } finally {
    await handle.close();
  }
}
