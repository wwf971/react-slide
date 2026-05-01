import { useMemo } from 'react';
import Slides from './Slides';
import CompMetadata from '../comp_custom/CompMetadata';
import CompTextSingleline from '../comp_custom/CompTextSingleline';
import CompTextMultline from '../comp_custom/CompTextMultline';
import CompImage from '../comp_custom/CompImage';
import CompExcalidraw from '../comp_custom/CompExcalidraw';
import CompCode from '../comp_custom/CompCode';
import CompIFrame from '../comp_custom/CompIFrame';
import CompUrl from '../comp_custom/CompUrl';
import { createDemoSlideStore } from '../contentStore';

const resolveComp = (compName) => {
  if (compName === 'CompTextSingleline') return CompTextSingleline;
  if (compName === 'CompTextMultline' || compName === 'CompTextMultiple') return CompTextMultline;
  if (compName === 'CompImage' || compName === 'CompImageExample') return CompImage;
  if (compName === 'CompExcalidraw') return CompExcalidraw;
  if (compName === 'CompCode') return CompCode;
  if (compName === 'CompIFrame') return CompIFrame;
  if (compName === 'CompUrl') return CompUrl;
  if (compName === 'CompMetadata') return CompMetadata;
  return CompMetadata;
};

const SlidesExample = () => {
  const store = useMemo(() => createDemoSlideStore(), []);
  const getComp = useMemo(() => resolveComp, []);

  return <Slides store={store} getComp={getComp} />;
};

export default SlidesExample;
