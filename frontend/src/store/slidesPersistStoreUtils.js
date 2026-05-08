const testImageLennaUrl = new URL('../test-image-lenna.png', import.meta.url).href;

const createDemoPersistData = () => {
  return {
    metadata: {
      pageIds: ['page-cover', 'page-body', 'page-end'],
      currentPageId: 'page-cover',
      aspectRatio: { x: 16, y: 9 },
    },
    pageDataById: {
      'page-cover': {
        id: 'page-cover',
        containerIds: ['container-title', 'container-image'],
      },
      'page-body': {
        id: 'page-body',
        containerIds: ['container-body-left', 'container-body-right'],
      },
      'page-end': {
        id: 'page-end',
        containerIds: ['container-end'],
      },
    },
    containerDataById: {
      'container-title': {
        id: 'container-title',
        pos: { x: 0.08, y: 0.14 },
        size: { x: 0.42, y: 0.22 },
        compId: 'comp-title-text',
      },
      'container-image': {
        id: 'container-image',
        pos: { x: 0.53, y: 0.14 },
        size: { x: 0.39, y: 0.42 },
        compId: 'comp-cover-image',
      },
      'container-body-left': {
        id: 'container-body-left',
        pos: { x: 0.08, y: 0.14 },
        size: { x: 0.4, y: 0.72 },
        compId: 'comp-body-meta',
      },
      'container-body-right': {
        id: 'container-body-right',
        pos: { x: 0.52, y: 0.14 },
        size: { x: 0.4, y: 0.72 },
        compId: 'comp-body-text',
      },
      'container-end': {
        id: 'container-end',
        pos: { x: 0.2, y: 0.3 },
        size: { x: 0.6, y: 0.32 },
        compId: 'comp-end-meta',
      },
    },
    compDataById: {
      'comp-title-text': {
        id: 'comp-title-text',
        compName: 'CompTextMultline',
        compData: {
          text: 'Editable title line 1\nEditable title line 2',
          initialPixelSize: { pixelX: 320, pixelY: 84 },
        },
      },
      'comp-cover-image': {
        id: 'comp-cover-image',
        compName: 'CompImage',
        compData: {
          isCover: true,
          imageUrl: testImageLennaUrl,
        },
      },
      'comp-body-meta': {
        id: 'comp-body-meta',
        compName: 'CompMetadata',
        compData: { title: 'Left', note: 'Page body left area' },
      },
      'comp-body-text': {
        id: 'comp-body-text',
        compName: 'CompTextMultline',
        compData: {
          text: 'You can edit this text.\nPress Enter for new lines.\nContainer auto-fits via store request.',
          initialPixelSize: { pixelX: 280, pixelY: 120 },
        },
      },
      'comp-end-meta': {
        id: 'comp-end-meta',
        compName: 'CompMetadata',
        compData: { title: 'Thanks', note: 'Final page sample' },
      },
    },
  };
};

export { createDemoPersistData };
