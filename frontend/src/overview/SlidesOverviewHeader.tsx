import { useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import DbSwitcher from '../backend/DbSwitcher';
import './SlidesOverviewHeader.css';

const SlidesOverviewHeader = observer(({
  slidesGroupStore,
  backendStore = null,
  onEndpointSwitchStart,
}: {
  slidesGroupStore: any;
  backendStore?: any;
  onEndpointSwitchStart?: () => void;
}) => {
  const switchRequestTokenRef = useRef(0);

  useEffect(() => {
    if (!backendStore) return;
    backendStore.requestLoadDatabases();
  }, [backendStore]);

  if (!backendStore) return null;

  const isSettingBusy = slidesGroupStore.isOverviewLoading
    || slidesGroupStore.isSubmitting
    || backendStore.isDatabaseSwitching;

  const handleSwitchDatabase = async (presetKey: string) => {
    if (!backendStore?.requestSwitchDatabase) return;
    const switchRequestToken = switchRequestTokenRef.current + 1;
    switchRequestTokenRef.current = switchRequestToken;
    const isLatestSwitchRequest = () => switchRequestTokenRef.current === switchRequestToken;
    if (onEndpointSwitchStart) {
      onEndpointSwitchStart();
    } else {
      slidesGroupStore.resetStateForDatabaseSwitch?.();
    }
    await backendStore.requestSwitchDatabase(presetKey);
    if (!isLatestSwitchRequest()) return;
    await backendStore.requestLoadDatabases?.(true);
    if (!isLatestSwitchRequest()) return;
    const endpointKeyCurrent = `${backendStore.endpointKeyCurrent ?? ''}`.trim();
    const currentDatabaseItem = (backendStore.databaseItems ?? []).find((item: any) => {
      return `${item?.key ?? ''}`.trim() === endpointKeyCurrent;
    });
    const isCurrentDatabaseReadable = currentDatabaseItem?.isConnected === true && currentDatabaseItem?.isInError !== true;
    if (!isCurrentDatabaseReadable) return;
    await slidesGroupStore.requestLoadOverview();
  };

  return (
    <div className="slides-overview-header">
      <DbSwitcher
        data={{
          items: backendStore.databaseItems ?? [],
          currentId: backendStore.endpointKeyCurrent ?? '',
          loadFailureMessage: backendStore.loadFailureMessage ?? '',
        }}
        config={{
          isSettingBusy,
          isLoading: backendStore.isDatabaseLoading ?? false,
          isSwitching: backendStore.isDatabaseSwitching ?? false,
          isTesting: backendStore.isDatabaseTesting ?? false,
          testingId: backendStore.testingDatabaseKey ?? '',
        }}
        onEvent={(eventType, eventData) => {
          if (eventType === 'refresh') {
            backendStore.requestLoadDatabases?.();
            return;
          }
          if (eventType === 'switch') {
            void handleSwitchDatabase(`${eventData?.id ?? ''}`);
            return;
          }
          if (eventType === 'test') {
            backendStore.requestTestDatabase?.(`${eventData?.id ?? ''}`);
          }
        }}
      />
    </div>
  );
});

export default SlidesOverviewHeader;
