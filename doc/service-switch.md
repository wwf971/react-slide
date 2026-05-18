# Service Switch Technique

Switching between backend services is stabilized with three combined mechanisms:

1. request ordering guards
2. explicit store reset before switching
3. post-switch authoritative reload

## 1) Request Ordering Guards

Each async loader keeps a monotonic request token.  
When a request starts, token increments; when response returns, code applies state only if token still matches latest.

This prevents older responses (often slower failures) from overwriting newer responses (often later successful reloads).

Code reflection:

- `frontend/src/store/slidesGroupStore.ts`
  - `overviewRequestToken`
  - `groupRequestToken`
  - guards inside `requestLoadOverview` and `requestLoadGroup`
- `frontend/src/store/backendStore.tsx`
  - `loadDatabasesRequestToken`
  - guard inside `requestLoadDatabases`

## 2) Explicit Reset Before Switch

Before service switch, overview/group state is cleared and request tokens are invalidated.

This guarantees old service data is not displayed during transition and in-flight stale requests become no-op when they return.

Code reflection:

- `frontend/src/store/slidesGroupStore.ts`
  - `resetStateForDatabaseSwitch()`
    - clears group/orphan/current/error/loading states
    - bumps request tokens

## 3) Post-Switch Authoritative Reload

After switch action, frontend reloads service presets and business data from backend source-of-truth.

This ensures UI state is rebuilt from current service instead of local transitional state.

Code reflection:

- `frontend/src/overview/SlidesOverviewHeader.tsx`
  - switch flow: reset state -> switch -> reload presets -> reload overview
- `frontend/src/layout/Header.tsx`
  - switch flow in slide page: switch -> reload presets -> reload slide data

## Resulting Behavior

Service switching becomes deterministic:

- no stale error text from previous requests
- no stale overview/group rows from previous service
- no late response overwrite race between failed and successful requests
