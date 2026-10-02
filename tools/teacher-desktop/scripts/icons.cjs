'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
async function main() {
  const assets = path.join(__dirname, '../assets');
  await fs.mkdir(assets, { recursive: true });
  const logo = await sharp(path.join(__dirname, '../../../public/logo1.png')).resize(426, 426, { fit: 'contain' }).png().toBuffer();
  const background = Buffer.from('<svg width="512" height="512"><rect width="512" height="512" rx="108" fill="#f4edff"/></svg>');
  const png = await sharp(background).composite([{ input: logo, left: 43, top: 43 }]).png().toBuffer();
  await fs.writeFile(path.join(assets, 'icon.png'), png);
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images = await Promise.all(sizes.map(size => sharp(png).resize(size, size).png().toBuffer()));
  const header = Buffer.alloc(6 + sizes.length * 16); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, index) => { const entry = 6 + index * 16; header[entry] = size === 256 ? 0 : size; header[entry + 1] = header[entry]; header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6); header.writeUInt32LE(images[index].length, entry + 8); header.writeUInt32LE(offset, entry + 12); offset += images[index].length; });
  await fs.writeFile(path.join(assets, 'icon.ico'), Buffer.concat([header, ...images]));
  console.log('Иконки приложения подготовлены');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
