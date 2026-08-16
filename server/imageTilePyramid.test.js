import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { createImageTilePyramidManager } from './imageTilePyramid.js';

const withTemporaryDirectory = async (run) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ege-image-tiles-'));
  try {
    return await run(directory);
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
};

test('small images stay on the regular single-image path', async () => {
  await withTemporaryDirectory(async (directory) => {
    const sourcePath = path.join(directory, 'small.png');
    await sharp({
      create: {
        width: 80,
        height: 40,
        channels: 4,
        background: '#ffffff',
      },
    }).png().toFile(sourcePath);

    const manager = createImageTilePyramidManager({
      cacheRoot: path.join(directory, 'cache'),
      tileSize: 64,
      maxSingleImageDimension: 128,
      maxSingleImagePixels: 128 * 128,
    });
    const manifest = await manager.getManifest({ sourcePath, cacheKey: 'small' });

    assert.deepEqual(
      { tiled: manifest.tiled, width: manifest.width, height: manifest.height },
      { tiled: false, width: 80, height: 40 }
    );
    assert.equal(fs.existsSync(path.join(directory, 'cache')), false);
  });
});
test('large images get a cached Deep Zoom pyramid with original-resolution tiles', async () => {
  await withTemporaryDirectory(async (directory) => {
    const sourcePath = path.join(directory, 'large.png');
    await sharp({
      create: {
        width: 150,
        height: 90,
        channels: 4,
        background: '#ffffff',
      },
    })
      .composite([{ input: Buffer.from('<svg width="75" height="90"><rect width="75" height="90" fill="#ef4444"/></svg>'), left: 0, top: 0 }])
      .png()
      .toFile(sourcePath);

    const manager = createImageTilePyramidManager({
      cacheRoot: path.join(directory, 'cache'),
      tileSize: 64,
      maxSingleImageDimension: 64,
      maxSingleImagePixels: 64 * 64,
    });
    const manifest = await manager.getManifest({ sourcePath, cacheKey: 'large' });

    assert.equal(manifest.tiled, true);
    assert.equal(manifest.width, 150);
    assert.equal(manifest.height, 90);
    assert.equal(manifest.tileSize, 64);
    assert.equal(manifest.format, 'png');
    assert.equal(manifest.maxLevel, 8);

    const firstTilePath = await manager.getTilePath({
      sourcePath,
      cacheKey: 'large',
      level: manifest.maxLevel,
      x: 0,
      y: 0,
    });
    assert.ok(firstTilePath);
    assert.equal(fs.existsSync(firstTilePath), true);
    const tileMetadata = await sharp(firstTilePath).metadata();
    assert.equal(tileMetadata.width, 64);
    assert.equal(tileMetadata.height, 64);

    const cachedManifest = await manager.getManifest({ sourcePath, cacheKey: 'large' });
    assert.equal(cachedManifest.version, manifest.version);
    assert.equal(
      await manager.getTilePath({
        sourcePath,
        cacheKey: 'large',
        level: manifest.maxLevel,
        x: 99,
        y: 99,
      }),
      null
    );
  });
});
