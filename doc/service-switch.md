# Service Switch Technique

Switching between backend object-storage services is stabilized by treating a switch as a global data-boundary event.

The important invariant:

When an endpoint switch starts, all endpoint-scoped frontend data must be cleared immediately, before waiting for the switch request.

## Frontend Switch Flow

1. Flush all endpoint-scoped MobX state.
2. Ask backend to switch endpoint.
3. Reload endpoint cards from backend source of truth.
4. Reload business data only if the selected endpoint is readable.

Code reflection:

- `frontend/src/App.jsx`
  - owns `onEndpointSwitchStart`
  - flushes both slide data and overview/group data
- `frontend/src/layout/Header.tsx`
  - slide-page endpoint switch calls `onEndpointSwitchStart` before the backend switch request
- `frontend/src/view-overall/SlideOverallHeader.tsx`
  - overview endpoint switch calls `onEndpointSwitchStart` before the backend switch request
- `frontend/src/store/slidesStore.tsx`
  - `resetStateForDatabaseSwitch()`
  - clears slide list, current slide, runtime slide data, dirty state, and local slide/resource caches
- `frontend/src/store/slidesGroupStore.ts`
  - `resetStateForDatabaseSwitch()`
  - clears group rows, orphan rows, selected group, cached slide names, current group, and request tokens
- `frontend/src/store/backendStore.tsx`
  - `loadDatabasesRequestToken`
  - guard inside `requestLoadDatabases`

## Request Ordering Guards

Async loaders still use monotonic request tokens.

When a request starts, its token is captured. When the response returns, state is applied only if the token still matches the latest token.

This prevents late responses from an older endpoint from repopulating stores after a newer switch has already cleared them.

## Readable Endpoint Check

The backend can mark an endpoint as currently selected even if that endpoint cannot be read.

That means frontend reload must not use `endpointKeyCurrent` alone as proof that business data is safe to load. After reloading endpoint cards, check the current endpoint item:

- `isConnected === true`
- `isInError !== true`

Only then reload slide overview or slide content. If the current endpoint is selected but not readable, keep business stores empty.

## Server Switch Cautions

Switching server-side storage is error-prone. Be careful about these cases:

- Do not confuse "selected" with "ready". A server may successfully set the active endpoint pointer while initialization or health check fails.
- If a switch failure still updates server current endpoint state, return the new `endpointKeyCurrent` and an endpoint item with error state. The client needs both facts.
- Avoid silently falling back to the previous valid endpoint for business reads. If the selected endpoint is invalid, business APIs should fail clearly or return empty/error responses, not old data.
- Keep endpoint-card refresh independent from business-data refresh. It is valid to load endpoint cards while the selected endpoint is broken.
- Make response shape consistent for success and error responses. On switch errors, include enough endpoint data for the UI to mark the requested card as current and broken.
- Be careful with cached frontend data. List APIs and local caches must not return previous endpoint data after a switch has started.
- Treat retries and manual refresh as new reads from the currently selected endpoint, not as a reason to reuse stale data.
- If an in-flight request started before a switch, its result must not be allowed to write into stores after the switch reset.

## Resulting Behavior

Service switching becomes deterministic:

- no stale error text from previous requests
- no stale overview/group rows from previous service
- no stale slide list or slide content from previous service
- no late response overwrite race between failed and successful requests
- invalid selected endpoints show as selected in endpoint cards, while business data stays empty
