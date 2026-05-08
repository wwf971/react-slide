# Object Storage Based Data Model

This project no longer persists slide data in app-local SQL tables. All durable data is stored in the external `storage-obj` service.

## Core Rules

- No app-level ids are used.
- Every persistent id is an object-storage `objectId`.
- IDs like `sld-*`, `res-*`, `pag-*`, `ctr-*`, `cmp-*`, `grp-*` are not part of the storage contract.

## Space

- React-note backend resolves a target space by name via object-storage API.
- All reads and writes are scoped to that space id.
- Space metadata is used only for global pointers (for example `reactNoteSlideGroupMetaObjectId`).

## Object Types

Objects are stored by `(dataType, type)`:

- Slide
  - `dataType=json`, `type=1`
  - `objectId` is the slide id.
  - Payload contains slide `name`, `metadata`, `pageDataById`, `containerDataById`, `compDataById`.

- Page
  - `dataType=json`, `type=2`
  - Legacy compatibility only. Normal runtime persists page/container/component maps inside slide payload.

- Container
  - `dataType=json`, `type=3`
  - Legacy compatibility only.

- Component
  - `dataType=json`, `type=4`
  - Legacy compatibility only.

- Resource Meta
  - `dataType=json`, `type=5`
  - `objectId` is the resource id.
  - Payload: `kind` (`bytes` or `text`), `contentObjectId`, timestamps.

- Resource Content Text
  - `dataType=text`, `type=6`
  - Actual text payload for text resources.

- Resource Content Bytes
  - `dataType=bytes`, `type=7`
  - Base64 payload for binary resources.

- Slide Group
  - `dataType=json`, `type=8`
  - Payload: `groupId`, `name`, `slides`, `folderPaths`, timestamps.

- Slide Group Meta
  - `dataType=json`, `type=9`
  - Global index object with `slideGroupIdList`.

## Versioning and Deletes

- Object updates use object-storage versioned updates.
- Backend requests `isDeletePreviousData=true` for normal updates to reduce old payload retention.
- Slide deletion also removes related page/container/component objects and unreferenced resource objects to avoid object trash.
