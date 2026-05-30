import { useMemo } from 'react';
import SlideSingleView from './SlideSingleView';
import CompMetadata from '../comp_custom/CompMetadata';
import CompTextSingleline from '../comp_custom/CompTextSingleline';
import CompTextMultline from '../comp_custom/CompTextMultline';
import CompImage from '../comp_custom/CompImage';
import CompExcalidraw from '../comp_custom/CompExcalidraw';
import CompCode from '../comp_custom/CompCode';
import CompIFrame from '../comp_custom/CompIFrame';
import CompUrl from '../comp_custom/CompUrl';
import { createDemoSlideStore } from '../store/slidesStore';
import { createBackendStore } from '../store/backendStore';

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

const SlideSingleExample = () => {
  const store = useMemo(() => createDemoSlideStore(), []);
  const backendStore = useMemo(() => createBackendStore(), []);
  const getComp = useMemo(() => resolveComp, []);

  return <SlideSingleView store={store} backendStore={backendStore} getComp={getComp} />;
};

export default SlideSingleExample;
