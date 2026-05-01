import { LeftIcon, RightIcon, PlusIcon } from '@wwf971/react-comp-misc/Icon';

const PageEdgeNavControls = ({
  isPrevEnabled,
  isNextEnabled,
  onGoPrev,
  onGoNext,
  onCreateNextPage,
}: any) => {
  const LeftIco = LeftIcon as any;
  const RightIco = RightIcon as any;
  const PlusIco = PlusIcon as any;
  return (
    <div className="slide-page-edge-nav-root">
      <div className="slide-page-edge-nav-zone slide-page-edge-nav-zone-left">
        <button
          className="slide-page-edge-nav-btn"
          type="button"
          disabled={!isPrevEnabled}
          onClick={onGoPrev}
        >
          <LeftIco width={20} height={20} />
        </button>
      </div>
      <div className="slide-page-edge-nav-zone slide-page-edge-nav-zone-right">
        <button
          className="slide-page-edge-nav-btn"
          type="button"
          disabled={!isNextEnabled && !onCreateNextPage}
          onClick={() => {
            if (isNextEnabled) {
              onGoNext?.();
              return;
            }
            onCreateNextPage?.();
          }}
        >
          {isNextEnabled ? <RightIco width={20} height={20} /> : <PlusIco width={20} height={20} />}
        </button>
      </div>
    </div>
  );
};

export default PageEdgeNavControls;
