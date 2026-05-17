# react-slide deploy summary

## Core rule

Frontend build base path and reverse-proxy public prefix must match.

Example:
- frontend is built with base `/slides/`
- nginx exposes `location /slides/ { proxy_pass http://<backend-host>:9300/; }`
- browser requests `/slides/assets/...` and `/slides/api/...`
- nginx strips `/slides/` and forwards to backend `/assets/...` and `/api/...`

If these two prefixes are different, assets and API calls will fail.

## Current design

- Vite base path is configurable through `VITE_APP_BASE_PATH` (`frontend/vite.config.js`).
- Router basename is derived from `import.meta.env.BASE_URL` (`frontend/publicPath.js` + `frontend/src/App.jsx`).
- API base URL is derived from the same base (`frontend/publicPath.js`), so API calls follow the deploy prefix.
- Deploy scripts under `script/` should set base path before build (example pattern: `deploy-to-xxx.sh`).

## Portability pattern

To deploy with another prefix (for example `/deck/`):
1. Set `VITE_APP_BASE_PATH=/deck/` in deploy build.
2. Configure nginx:
   - `location /deck/ { proxy_pass http://<backend-host>:9300/; }`
3. Deploy.

No frontend source changes are required when only prefix/machine changes.

## Proxy/CDN recommendations

- Disable or tightly limit caching for dynamic API routes (for example `/slides/api/*`).
- Forward required auth/session data from proxy/CDN to origin if used.
