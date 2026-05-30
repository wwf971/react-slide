import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { authStore } from '../auth/authStore';
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
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    if (!backendStore) return;
    backendStore.requestLoadDatabases();
  }, [backendStore]);

  useEffect(() => {
    const handleDocumentMouseDown = (event: MouseEvent) => {
      const menuElement = menuRef.current;
      if (!menuElement) return;
      if (menuElement.contains(event.target as Node)) return;
      setIsMenuOpen(false);
    };
    document.addEventListener('mousedown', handleDocumentMouseDown, true);
    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown, true);
    };
  }, []);

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

  const handleMenuToggle = () => {
    setIsMenuOpen((prev) => !prev);
  };

  const handleLogoutClick = async () => {
    setIsMenuOpen(false);
    await authStore.logoutWithApi();
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
      <div className="slides-overview-header-auth" ref={menuRef}>
        <button
          className="slides-overview-header-auth-button"
          disabled={authStore.isLoading}
          type="button"
          onClick={handleMenuToggle}
        >
          <span>{authStore.isLoading ? 'logging out' : 'logged in'}</span>
        </button>
        {isMenuOpen ? (
          <div className="slides-overview-header-menu-list">
            <button
              className="slides-overview-header-menu-item"
              disabled={authStore.isLoading}
              onClick={handleLogoutClick}
              type="button"
            >
              log out
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
});

export default SlideOverallHeader;
