const createSeedSlideData = () => {
  const testImageLennaUrl = new URL('../test-image-lenna.png', import.meta.url).href;
  return {
    name: 'Demo Slide',
    metadata: {
      pageIds: ['pag-cover', 'pag-body', 'pag-end'],
      currentPageId: 'pag-cover',
      aspectRatio: { x: 16, y: 9 },
    },
    pageDataById: {
      'pag-cover': {
        id: 'pag-cover',
        containerIds: ['ctr-title', 'ctr-image'],
      },
      'pag-body': {
        id: 'pag-body',
        containerIds: ['ctr-body-left', 'ctr-body-right'],
      },
      'pag-end': {
        id: 'pag-end',
        containerIds: ['ctr-end'],
      },
    },
    containerDataById: {
      'ctr-title': {
        id: 'ctr-title',
        pos: { x: 0.08, y: 0.14 },
        size: { x: 0.42, y: 0.22 },
        compId: 'cmp-title-text',
      },
      'ctr-image': {
        id: 'ctr-image',
        pos: { x: 0.53, y: 0.14 },
        size: { x: 0.39, y: 0.42 },
        compId: 'cmp-cover-image',
      },
      'ctr-body-left': {
        id: 'ctr-body-left',
        pos: { x: 0.08, y: 0.14 },
        size: { x: 0.4, y: 0.72 },
        compId: 'cmp-body-meta',
      },
      'ctr-body-right': {
        id: 'ctr-body-right',
        pos: { x: 0.52, y: 0.14 },
        size: { x: 0.4, y: 0.72 },
        compId: 'cmp-body-text',
      },
      'ctr-end': {
        id: 'ctr-end',
        pos: { x: 0.2, y: 0.3 },
        size: { x: 0.6, y: 0.32 },
        compId: 'cmp-end-meta',
      },
    },
    compDataById: {
      'cmp-title-text': {
        id: 'cmp-title-text',
        compName: 'CompTextMultline',
        compData: {
          text: 'Editable title line 1\nEditable title line 2',
          initialPixelSize: { pixelX: 320, pixelY: 84 },
        },
      },
      'cmp-cover-image': {
        id: 'cmp-cover-image',
        compName: 'CompImage',
        compData: {
          isCover: true,
          imageUrl: testImageLennaUrl,
        },
      },
      'cmp-body-meta': {
        id: 'cmp-body-meta',
        compName: 'CompMetadata',
        compData: { title: 'Left', note: 'Page body left area' },
      },
      'cmp-body-text': {
        id: 'cmp-body-text',
        compName: 'CompTextMultline',
        compData: {
          text: 'You can edit this text.\nPress Enter for new lines.\nContainer auto-fits via store request.',
          initialPixelSize: { pixelX: 280, pixelY: 120 },
        },
      },
      'cmp-end-meta': {
        id: 'cmp-end-meta',
        compName: 'CompMetadata',
        compData: { title: 'Thanks', note: 'Final page sample' },
      },
    },
  };
};

const createSeedSlideDocument = () => {
  return {
    id: 'sld-seed0001',
    name: 'Demo Slide',
    data: createSeedSlideData(),
  };
};

export { createSeedSlideData, createSeedSlideDocument };
