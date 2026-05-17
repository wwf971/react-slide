import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import DbSwitcher from '../backend/DbSwitcher';
import './SlidesOverviewHeader.css';

const SlidesOverviewHeader = observer(({
  slidesGroupStore,
  backendStore = null,
}: {
  slidesGroupStore: any;
  backendStore?: any;
}) => {
  useEffect(() => {
    if (!backendStore) return;
    backendStore.requestLoadDatabases();
  }, [backendStore]);

  if (!backendStore) return null;

  const isSettingBusy = slidesGroupStore.isOverviewLoading || slidesGroupStore.isSubmitting;

  const handleSwitchDatabase = async (presetKey: string) => {
    if (!backendStore?.requestSwitchDatabase) return;
    const result = await backendStore.requestSwitchDatabase(presetKey);
    if (!result?.ok) return;
    await slidesGroupStore.requestLoadOverview();
  };

  return (
    <div className="slides-overview-header">
      <DbSwitcher
        data={{
          items: backendStore.databaseItems ?? [],
          currentId: backendStore.currentDatabaseKey ?? '',
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
