import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

export const DEFAULT_IMAGE_TILE_SIZE = 512;
export const DEFAULT_IMAGE_TILE_MAX_DIMENSION = 4096;
export const DEFAULT_IMAGE_TILE_MAX_PIXELS = 16 * 1024 * 1024;
export const DEFAULT_IMAGE_TILE_INPUT_PIXEL_LIMIT = 128 * 1024 * 1024;

const PYRAMID_DESCRIPTOR_NAME = 'image.dzi';
const PYRAMID_TILES_DIRECTORY_NAME = 'image_files';
const PYRAMID_FORMAT = 'png';

const clampPositiveInteger = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
};

const buildSourceVersion = (sourcePath, cacheKey, stat) => crypto
  .createHash('sha256')
  .update(String(cacheKey || ''))
  .update('\0')
  .update(path.resolve(sourcePath))
  .update('\0')
  .update(String(stat.size))
  .update('\0')
  .update(String(Math.floor(stat.mtimeMs)))
  .digest('hex')
  .slice(0, 32);

const parseDeepZoomDescriptor = async (descriptorPath) => {
  const xml = await fs.promises.readFile(descriptorPath, 'utf8');
  const width = Number(xml.match(/\bWidth="(\d+)"/i)?.[1]);
  const height = Number(xml.match(/\bHeight="(\d+)"/i)?.[1]);
  const tileSize = Number(xml.match(/\bTileSize="(\d+)"/i)?.[1]);
  const overlap = Number(xml.match(/\bOverlap="(\d+)"/i)?.[1]);
  const format = String(xml.match(/\bFormat="([A-Za-z0-9]+)"/i)?.[1] || '').toLowerCase();
  if (
    !Number.isFinite(width)
    || width <= 0
    || !Number.isFinite(height)
    || height <= 0
    || !Number.isFinite(tileSize)
    || tileSize <= 0
    || !format
  ) {
    throw new Error('Некорректное описание тайлов изображения');
  }
  return {
    width,
    height,
    tileSize,
    overlap: Number.isFinite(overlap) && overlap >= 0 ? overlap : 0,
    format,
    minLevel: 0,
    maxLevel: Math.ceil(Math.log2(Math.max(width, height))),
  };
};

const getLevelDimensions = (manifest, level) => {
  const scale = 2 ** (level - manifest.maxLevel);
  return {
    width: Math.max(1, Math.ceil(manifest.width * scale)),
    height: Math.max(1, Math.ceil(manifest.height * scale)),
  };
};

const isTileCoordinateValid = (manifest, level, x, y) => {
  if (
    !Number.isInteger(level)
    || level < manifest.minLevel
    || level > manifest.maxLevel
    || !Number.isInteger(x)
    || x < 0
    || !Number.isInteger(y)
    || y < 0
  ) {
    return false;
  }
  const levelDimensions = getLevelDimensions(manifest, level);
  const columns = Math.ceil(levelDimensions.width / manifest.tileSize);
  const rows = Math.ceil(levelDimensions.height / manifest.tileSize);
  return x < columns && y < rows;
};

const wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

const promoteTemporaryDirectory = async (temporaryDirectory, cacheDirectory) => {
  const retryDelays = [30, 80, 160, 320, 640];
  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    try {
      await fs.promises.rename(temporaryDirectory, cacheDirectory);
      return;
    } catch (error) {
      if (['EEXIST', 'ENOTEMPTY'].includes(error?.code)) {
        await fs.promises.rm(temporaryDirectory, { recursive: true, force: true });
        return;
      }
      const canRetry = ['EPERM', 'EBUSY'].includes(error?.code) && attempt < retryDelays.length;
      if (!canRetry) {
        if (!['EPERM', 'EBUSY'].includes(error?.code)) throw error;
        break;
      }
      await wait(retryDelays[attempt]);
    }
  }

  // Windows can briefly retain libvips file handles after a large pyramid is
  // finished, preventing an otherwise safe directory rename. Copying the
  // completed cache is a reliable fallback; the source is removed afterwards.
  await fs.promises.cp(temporaryDirectory, cacheDirectory, {
    recursive: true,
    force: false,
    errorOnExist: false,
  });
  await fs.promises.rm(temporaryDirectory, { recursive: true, force: true });
};

export const createImageTilePyramidManager = (options = {}) => {
  const rawCacheRoot = String(options.cacheRoot || '').trim();
  if (!rawCacheRoot) throw new Error('cacheRoot required');
  const cacheRoot = path.resolve(rawCacheRoot);

  const tileSize = clampPositiveInteger(options.tileSize, DEFAULT_IMAGE_TILE_SIZE);
  const maxSingleImageDimension = clampPositiveInteger(
    options.maxSingleImageDimension,
    DEFAULT_IMAGE_TILE_MAX_DIMENSION
  );
  const maxSingleImagePixels = clampPositiveInteger(
    options.maxSingleImagePixels,
    DEFAULT_IMAGE_TILE_MAX_PIXELS
  );
  const inputPixelLimit = clampPositiveInteger(
    options.inputPixelLimit,
    DEFAULT_IMAGE_TILE_INPUT_PIXEL_LIMIT
  );
  const builds = new Map();

  const inspectSource = async (sourcePath, cacheKey = '') => {
    const resolvedSourcePath = path.resolve(sourcePath);
    const stat = await fs.promises.stat(resolvedSourcePath);
    if (!stat.isFile()) throw new Error('Файл изображения не найден');
    const metadata = await sharp(resolvedSourcePath, { limitInputPixels: inputPixelLimit }).metadata();
    const width = Number(metadata.width);
    const height = Number(metadata.height);
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      throw new Error('Не удалось определить размер изображения');
    }
    return {
      sourcePath: resolvedSourcePath,
      stat,
      width,
      height,
      version: buildSourceVersion(resolvedSourcePath, cacheKey, stat),
      shouldTile: Math.max(width, height) > maxSingleImageDimension
        || width * height > maxSingleImagePixels,
    };
  };

  const buildPyramid = async (source) => {
    const cacheDirectory = path.join(cacheRoot, source.version);
    const descriptorPath = path.join(cacheDirectory, PYRAMID_DESCRIPTOR_NAME);
    const tilesDirectory = path.join(cacheDirectory, PYRAMID_TILES_DIRECTORY_NAME);
    try {
      const manifest = await parseDeepZoomDescriptor(descriptorPath);
      const tilesStat = await fs.promises.stat(tilesDirectory);
      if (tilesStat.isDirectory()) {
        return { ...manifest, version: source.version, cacheDirectory, tilesDirectory };
      }
    } catch {
      // The cache is missing or incomplete and will be rebuilt atomically below.
    }

    if (builds.has(source.version)) return builds.get(source.version);

    const buildPromise = (async () => {
      await fs.promises.mkdir(cacheRoot, { recursive: true });
      const temporaryDirectory = path.join(
        cacheRoot,
        `.${source.version}-${crypto.randomUUID()}`
      );
      await fs.promises.mkdir(temporaryDirectory, { recursive: true });
      try {
        await sharp(source.sourcePath, {
          limitInputPixels: inputPixelLimit,
          sequentialRead: true,
        })
          .rotate()
          .png({ compressionLevel: 6, adaptiveFiltering: true })
          .tile({
            size: tileSize,
            overlap: 0,
            layout: 'dz',
            container: 'fs',
            depth: 'onepixel',
            skipBlanks: -1,
          })
          .toFile(path.join(temporaryDirectory, 'image.dz'));

        const temporaryDescriptorPath = path.join(temporaryDirectory, PYRAMID_DESCRIPTOR_NAME);
        const temporaryTilesDirectory = path.join(temporaryDirectory, PYRAMID_TILES_DIRECTORY_NAME);
        const manifest = await parseDeepZoomDescriptor(temporaryDescriptorPath);
        const tilesStat = await fs.promises.stat(temporaryTilesDirectory);
        if (!tilesStat.isDirectory()) throw new Error('Тайлы изображения не созданы');

        await promoteTemporaryDirectory(temporaryDirectory, cacheDirectory);

        return {
          ...manifest,
          version: source.version,
          cacheDirectory,
          tilesDirectory,
        };
      } catch (error) {
        await fs.promises.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {});
        throw error;
      }
    })();

    builds.set(source.version, buildPromise);
    try {
      return await buildPromise;
    } finally {
      if (builds.get(source.version) === buildPromise) builds.delete(source.version);
    }
  };

  const getManifest = async ({ sourcePath, cacheKey = '' } = {}) => {
    const source = await inspectSource(sourcePath, cacheKey);
    if (!source.shouldTile) {
      return {
        tiled: false,
        width: source.width,
        height: source.height,
        version: source.version,
      };
    }
    const manifest = await buildPyramid(source);
    return {
      tiled: true,
      width: manifest.width,
      height: manifest.height,
      tileSize: manifest.tileSize,
      overlap: manifest.overlap,
      format: manifest.format,
      minLevel: manifest.minLevel,
      maxLevel: manifest.maxLevel,
      version: manifest.version,
    };
  };

  const getTilePath = async ({ sourcePath, cacheKey = '', level, x, y } = {}) => {
    const source = await inspectSource(sourcePath, cacheKey);
    if (!source.shouldTile) return null;
    const manifest = await buildPyramid(source);
    const normalizedLevel = Number(level);
    const normalizedX = Number(x);
    const normalizedY = Number(y);
    if (!isTileCoordinateValid(manifest, normalizedLevel, normalizedX, normalizedY)) return null;
    const tilePath = path.join(
      manifest.tilesDirectory,
      String(normalizedLevel),
      `${normalizedX}_${normalizedY}.${manifest.format}`
    );
    try {
      const stat = await fs.promises.stat(tilePath);
      return stat.isFile() ? tilePath : null;
    } catch {
      return null;
    }
  };

  return { getManifest, getTilePath };
};
