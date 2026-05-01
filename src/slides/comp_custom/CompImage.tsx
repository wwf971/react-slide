import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import Menu from '@wwf971/react-comp-misc/Menu';
import { useSlidesStore } from '../contentStore';

const CompImage = observer(
  ({ data, containerId, requestContainerMoveByPointer, isReadOnly }: any) => {
  const store = useSlidesStore();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = useState(null);
  const [errorText, setErrorText] = useState('');
  const [isImageLoadError, setIsImageLoadError] = useState(false);
  const [resourceImageUrl, setResourceImageUrl] = useState('');
  const isCover = data?.isCover === true;
  const imageResourceId = data?.imageResourceId ?? '';
  const imageMimeType = data?.imageMimeType ?? 'image/png';
  const imageUrl = resourceImageUrl || data?.imageUrl || '';
  const hasConfiguredImage = Boolean(imageResourceId || data?.imageUrl);
  const containerSize = store.getContainerSize(containerId);
  const hasImageData = typeof imageUrl === 'string' && imageUrl.length > 0;
  const isImageDataValid =
    hasImageData &&
    (imageUrl.startsWith('data:image/') ||
      imageUrl.startsWith('http://') ||
      imageUrl.startsWith('https://') ||
      imageUrl.startsWith('/'));

  useEffect(() => {
    let isCancelled = false;
    if (!imageResourceId) {
      setResourceImageUrl('');
      return () => {
        isCancelled = true;
      };
    }
    const loadResource = async () => {
      const result = await store.requestGetResourceBytes(imageResourceId);
      if (isCancelled) return;
      if (!result?.ok || !result.base64) {
        setErrorText(result?.message ?? 'Image resource data is missing');
        setResourceImageUrl('');
        return;
      }
      setResourceImageUrl(`data:${imageMimeType};base64,${result.base64}`);
      setErrorText('');
    };
    loadResource();
    return () => {
      isCancelled = true;
    };
  }, [imageResourceId, imageMimeType, store]);

  const convertFileToBase64 = (file: File) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(`${reader.result ?? ''}`);
      reader.onerror = () => reject(new Error('failed to read image'));
      reader.readAsDataURL(file);
    });
  };

  const applyImageFile = async (file: File | null) => {
    if (!file) {
      setErrorText('No image found in clipboard');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setErrorText('Clipboard content is not image data');
      return;
    }
    const dataUrl = await convertFileToBase64(file);
    let resourceId = imageResourceId;
    if (!resourceId) {
      const createResult = await store.requestCreateBytesResource();
      if (!createResult?.ok || !createResult.resourceId) {
        setErrorText('Failed to allocate image resource');
        return;
      }
      resourceId = createResult.resourceId;
    }
    const saveResult = await store.requestSetResourceBytes(resourceId, dataUrl);
    if (!saveResult?.ok) {
      setErrorText('Failed to save image resource data');
      return;
    }
    store.requestContainerCompDataUpdate(containerId, {
      imageResourceId: resourceId,
      imageMimeType: file.type || 'image/png',
      imageUrl: '',
    });
    setResourceImageUrl(dataUrl);
    setErrorText('');
    setIsImageLoadError(false);
  };

  const computedErrorText = (() => {
    if (!hasConfiguredImage) return '';
    if (errorText) return errorText;
    if (!hasImageData) return 'Image data is missing';
    if (!isImageDataValid) return 'Image data format is invalid';
    if (isImageLoadError) return 'Image cannot be loaded';
    return '';
  })();

  return (
    <div
      ref={rootRef}
      className="slide-image-root"
      tabIndex={0}
      onPaste={async (event) => {
        if (isReadOnly) return;
        const item = Array.from(event.clipboardData?.items ?? []).find((entry: any) => {
          return entry.type?.startsWith('image/');
        });
        if (!item) return;
        event.preventDefault();
        const file = item.getAsFile();
        try {
          await applyImageFile(file);
        } catch {
          setErrorText('Failed to process clipboard image');
        }
      }}
      onPointerDown={(event) => {
        rootRef.current?.focus();
        if (isReadOnly) return;
        if (!requestContainerMoveByPointer) return;
        requestContainerMoveByPointer(event);
      }}
      onContextMenu={(event) => {
        if (isReadOnly) return;
        event.preventDefault();
        setMenuPosition({
          x: event.clientX,
          y: event.clientY,
        });
      }}
    >
      {hasImageData ? (
        <img
          src={imageUrl}
          className="slide-image-content"
          style={{ objectFit: isCover ? 'cover' : 'contain' }}
          onLoad={() => {
            setIsImageLoadError(false);
          }}
          onError={() => {
            setIsImageLoadError(true);
          }}
        />
      ) : null}
      {!hasConfiguredImage ? <div className="slide-image-empty">Paste an Image Here</div> : null}
      {computedErrorText ? <div className="slide-image-error">{computedErrorText}</div> : null}
      <div className="slide-image-size">
        {containerSize.pixelX} x {containerSize.pixelY}
      </div>
      {menuPosition && (
        <Menu
          position={menuPosition}
          onClose={() => setMenuPosition(null)}
          onContextMenu={(event) => {
            event.preventDefault();
            setMenuPosition({
              x: event.clientX,
              y: event.clientY,
            });
          }}
          onItemClick={(item) => {
            if (item?.name === 'Fill container') {
              store.requestContainerCompDataUpdate(containerId, { isCover: true });
            }
            if (item?.name === 'Show entire image') {
              store.requestContainerCompDataUpdate(containerId, { isCover: false });
            }
          }}
          items={[
            {
              type: 'item',
              name: 'Fill container',
              disabled: isCover,
            },
            {
              type: 'item',
              name: 'Show entire image',
              disabled: !isCover,
            },
          ]}
        />
      )}
    </div>
  );
});

export default CompImage;
