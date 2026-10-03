'use strict';

const { isPlatform } = require('./policy.cjs');

function imageContextMenu(contents, params, downloadImage) {
  if (params.mediaType !== 'image' || !params.hasImageContents) return [];
  const page = contents.getURL();
  const template = [{
    id: 'copy-image', label: 'Копировать изображение',
    click: () => {
      if (!contents.isDestroyed() && contents.getURL() === page) {
        // Chromium copies the loaded image itself, including authenticated and
        // blob images. Copying its URL would not produce a board paste image.
        contents.copyImageAt(params.x, params.y);
      }
    },
  }];
  if (typeof downloadImage === 'function' && params.srcURL && isPlatform(page) && isPlatform(params.frameURL || page)) {
    template.push({
      id: 'download-image', label: 'Скачать изображение',
      click: () => {
        if (!contents.isDestroyed() && contents.getURL() === page) downloadImage(contents, params.srcURL);
      },
    });
  }
  return template;
}

module.exports = { imageContextMenu };
