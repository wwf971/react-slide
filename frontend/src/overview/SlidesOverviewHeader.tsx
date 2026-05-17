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
        databaseItems={backendStore.databaseItems ?? []}
        currentDatabaseKey={backendStore.currentDatabaseKey ?? ''}
        isSettingBusy={isSettingBusy}
        isDatabaseLoading={backendStore.isDatabaseLoading ?? false}
        isDatabaseSwitching={backendStore.isDatabaseSwitching ?? false}
        isDatabaseTesting={backendStore.isDatabaseTesting ?? false}
        testingDatabaseKey={backendStore.testingDatabaseKey ?? ''}
        loadFailureMessage={backendStore.loadFailureMessage ?? ''}
        onRefreshDatabases={() => {
          backendStore.requestLoadDatabases?.();
        }}
        onSwitchDatabase={handleSwitchDatabase}
        onTestDatabase={(presetKey: string) => {
          backendStore.requestTestDatabase?.(presetKey);
        }}
      />
    </div>
  );
});

export default SlidesOverviewHeader;
