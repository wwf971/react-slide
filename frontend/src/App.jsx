import { useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { BrowserRouter, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import Slides from './slide/Slides';
import SlideOverview from './overview/SlideOverview';
import GroupViewPage from './group-view/GroupViewPage';
import CompMetadata from './comp_custom/CompMetadata';
import CompTextSingleline from './comp_custom/CompTextSingleline';
import CompTextMultline from './comp_custom/CompTextMultline';
import CompImage from './comp_custom/CompImage';
import CompExcalidraw from './comp_custom/CompExcalidraw';
import CompCode from './comp_custom/CompCode';
import CompIFrame from './comp_custom/CompIFrame';
import CompUrl from './comp_custom/CompUrl';
import { createDemoSlideStore } from './store/slidesStore';
import { createBackendStore } from './store/backendStore';
import { createSlidesGroupStore } from './store/slidesGroupStore';
import './App.css';

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

const SlideRoutePage = observer(({ slidesStore, backendStore, getComp }) => {
  const navigate = useNavigate();
  const params = useParams();
  const routeSlideId = `${params?.slideId ?? ''}`.trim();

  return (
    <Slides
      store={slidesStore}
      backendStore={backendStore}
      getComp={getComp}
      requestedSlideId={routeSlideId}
      onRequestOpenGroupView={(groupId, slideId) => {
        const safeGroupId = `${groupId ?? ''}`.trim();
        const safeSlideId = `${slideId ?? ''}`.trim();
        if (!safeGroupId || !safeSlideId) return;
        navigate(
          `/group/${encodeURIComponent(safeGroupId)}?selectedSlide=${encodeURIComponent(safeSlideId)}`,
        );
      }}
      onCurrentSlideIdChange={(nextSlideId) => {
        const nextRouteSlideId = `${nextSlideId ?? ''}`.trim();
        if (!nextRouteSlideId) return;
        if (nextRouteSlideId === routeSlideId) return;
        navigate(`/slide/${encodeURIComponent(nextRouteSlideId)}`, { replace: true });
      }}
    />
  );
});

function App() {
  const slidesStore = useMemo(() => createDemoSlideStore(), []);
  const backendStore = useMemo(() => createBackendStore(), []);
  const slidesGroupStore = useMemo(() => createSlidesGroupStore(), []);
  const getComp = useMemo(() => resolveComp, []);

  return (
    <div className="note-app-root">
      <BrowserRouter>
        <Routes>
          <Route
            path="/overview"
            element={(
              <SlideOverview
                slidesGroupStore={slidesGroupStore}
                backendStore={backendStore}
              />
            )}
          />
          <Route
            path="/group/:groupId"
            element={(
              <GroupViewPage
                slidesGroupStore={slidesGroupStore}
                slidesStore={slidesStore}
                getComp={getComp}
              />
            )}
          />
          <Route
            path="/slide/:slideId"
            element={(
              <SlideRoutePage
                slidesStore={slidesStore}
                backendStore={backendStore}
                getComp={getComp}
              />
            )}
          />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
