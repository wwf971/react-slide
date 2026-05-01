# Slide DB Structure

- `slide_documents`
  - One row per slide, keyed by `id` (for example `sld-xxxxx`).
  - `data_json` stores the full slide document JSON:
    - `name`
    - `metadata` (`pageIds`, `currentPageId`, `aspectRatio`)
    - `pageDataById` (page -> container id list)
    - `containerDataById` (container -> position/size/comp link)
    - `compDataById` (component -> `compName` + `compData`)
  - There is no separate `components` table right now. Component/page/container data is wrapped inside this JSON blob per slide row.
  - `created_at`, `updated_at` are ISO timestamp strings.

- `slide_resources`
  - One row per shared resource, keyed by `id` (for example `res-xxxxx`).
  - `type` is `bytes` or `text`.
  - `data_bytes` stores binary payload (images, excalidraw scene blobs, etc.) when `type=bytes`.
  - `data_text` stores text payload when `type=text`.
  - `created_at`, `updated_at` are ISO timestamp strings.

- Indexes
  - `idx_slide_documents_created` on `(created_at, id)`.
  - `idx_slide_resources_created` on `(created_at, id)`.
