# Slide Group Model

## Overview

- A slide-group is a JSON object stored in object-storage (`dataType=json`, `type=8`).
- Group id is the group object's `objectId`.
- A slide can belong to at most one group.
- Slide references inside a group use slide object-storage `objectId`.

## Group Data

- `groupId`: object-storage object id of the group itself.
- `name`: editable group name.
- `slides`: array of `{ slideId, path }`.
  - `slideId` is a slide object id.
  - `path` is folder-only path (no slide filename).
  - Stored normalized without leading/trailing slash, for example `aa/bb`.
- `folderPaths`: array of persisted folder paths.
  - Stored with trailing slash, for example `aa/bb/`.
  - Used to keep empty folders visible in tree.
- `createdAt`, `updatedAt`.

## Tree Construction

- Tree is built by merging:
  - inferred folder chain from every slide `path`
  - explicit `folderPaths` persisted folders
- Slide row name is slide data `name`.
- Slide row position comes from slide `path`.

## Folder States

Folder node can be interpreted as:

- Persisting folders
  - path is explicitly present in `folderPaths`
- Stable by descendant
  - one descendant folder is persisting
- Unstable inferred
  - exists only because current slide paths require it

## Folder Operations

- Set Persisting
  - adds normalized `path/` to `folderPaths`
  - keeps folder visible even with no slides
- Cancel Persisting
  - removes that exact path from `folderPaths`
  - folder remains if still required by slides or persisting descendants

## Group Meta Object

- Global group index uses slide-group-meta object (`dataType=json`, `type=9`).
- Data field `slideGroupIdList` stores all existing group ids.
- Space metadata key `reactNoteSlideGroupMetaObjectId` points to this meta object.
