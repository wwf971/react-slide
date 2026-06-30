import { useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { AuthStatusButton } from '@wwf971/react-comp-misc';
import { authStore } from '../store/appStore';
import DbSwitcher from '../backend/DbSwitcher';
import './SlideOverallHeader.css';

const SlideOverallHeader = observer(({
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
    if (!backendStore?.requestSwitchDatabase) return { ok: false };
    const switchRequestToken = switchRequestTokenRef.current + 1;
    switchRequestTokenRef.current = switchRequestToken;
    const isLatestSwitchRequest = () => switchRequestTokenRef.current === switchRequestToken;
    const switchResult = await backendStore.requestSwitchDatabase(presetKey);
    if (!isLatestSwitchRequest()) return { ok: false };
    if (!switchResult?.ok) return switchResult ?? { ok: false };
    if (onEndpointSwitchStart) {
      onEndpointSwitchStart();
    } else {
      slidesGroupStore.resetStateForDatabaseSwitch?.();
    }
    await backendStore.requestLoadDatabases?.(true);
    if (!isLatestSwitchRequest()) return { ok: false };
    const endpointKeyCurrent = `${backendStore.endpointKeyCurrent ?? ''}`.trim();
    const currentDatabaseItem = (backendStore.databaseItems ?? []).find((item: any) => {
      return `${item?.key ?? ''}`.trim() === endpointKeyCurrent;
    });
    const isCurrentDatabaseReadable = currentDatabaseItem?.isConnected === true && currentDatabaseItem?.isInError !== true;
    if (!isCurrentDatabaseReadable) return { ok: false };
    const overviewResult = await slidesGroupStore.requestLoadOverview();
    return { ok: overviewResult?.ok === true };
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
            return handleSwitchDatabase(`${eventData?.id ?? ''}`);
          }
          if (eventType === 'test') {
            backendStore.requestTestDatabase?.(`${eventData?.id ?? ''}`);
          }
        }}
      />
      <div className="slides-overview-header-auth">
        <AuthStatusButton
          data={{
            isLoggedIn: authStore.isLoggedIn,
            username: authStore.username,
          }}
          config={{
            isDisabled: authStore.isLoading,
          }}
          onEvent={(eventType) => {
            if (eventType === 'go-login') {
              authStore.goToLoginPage();
              return;
            }
            if (eventType === 'sign-out') {
              void authStore.logout();
            }
          }}
        />
      </div>
    </div>
  );
});

export default SlideOverallHeader;
