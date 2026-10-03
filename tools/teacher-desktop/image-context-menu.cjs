'use strict';

function imageContextMenu(contents, params) {
  if (params.mediaType !== 'image' || !params.hasImageContents) return [];
  const page = contents.getURL();
  return [{
    id: 'copy-image', label: 'Копировать изображение',
    click: () => {
      if (!contents.isDestroyed() && contents.getURL() === page) {
        // Chromium copies the loaded image itself, including authenticated and
        // blob images. Copying its URL would not produce a board paste image.
        contents.copyImageAt(params.x, params.y);
      }
    },
  }];
}

module.exports = { imageContextMenu };
