import { observer } from 'mobx-react-lite';
import { useSlidesStore } from '../store/slidesStore';

const CompMetadata = observer(
  ({ data, containerId, requestContainerMoveByPointer, isReadOnly }: any) => {
  const store = useSlidesStore();
  const containerData = store.getContainerData(containerId);
  const containerSize = store.getContainerSize(containerId);

  return (
    <div
      className="slide-meta-root"
      onPointerDown={(event) => {
        if (isReadOnly) return;
        if (!requestContainerMoveByPointer) return;
        requestContainerMoveByPointer(event);
      }}
    >
      <div className="slide-meta-title">{data?.title ?? 'CompMetadata'}</div>
      <div className="slide-meta-note">{data?.note ?? '-'}</div>
      <div className="slide-meta-grid">
        <div className="slide-meta-key">containerId</div>
        <div className="slide-meta-val">{containerId}</div>
        <div className="slide-meta-key">width(px)</div>
        <div className="slide-meta-val">{containerSize.pixelX}</div>
        <div className="slide-meta-key">height(px)</div>
        <div className="slide-meta-val">{containerSize.pixelY}</div>
        <div className="slide-meta-key">width(ratio)</div>
        <div className="slide-meta-val">{containerData?.size.x?.toFixed(3) ?? '-'}</div>
        <div className="slide-meta-key">height(ratio)</div>
        <div className="slide-meta-val">{containerData?.size.y?.toFixed(3) ?? '-'}</div>
      </div>
    </div>
  );
});

export default CompMetadata;
