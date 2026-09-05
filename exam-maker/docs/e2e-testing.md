# End-to-End Testing

This project uses Playwright for browser-level end-to-end tests.

## Local Checks

Run the same checks as CI:

```bash
npm run ci
```

Run only the end-to-end suite:

```bash
npm run e2e
```

Use headed mode when you want to watch the browser:

```bash
npm run e2e:headed
```

Open Playwright's interactive runner:

```bash
npm run e2e:ui
```

Inspect the latest HTML report:

```bash
npm run e2e:report
```

## Test Data

E2E runs use `.e2e-data/` as the API data root. The Playwright global setup removes and recreates that directory for isolated test runs.

## Servers

Playwright starts the API and web dev servers automatically during normal runs. If you already have both servers running, set:

```bash
PLAYWRIGHT_REUSE_SERVER=1 npm run e2e
```

The expected local URLs are:

- Web: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:3001/api/health`

## CI

GitHub Actions runs:

```bash
npm ci
npx playwright install --with-deps chromium
npm run ci
```

On failure, CI uploads Playwright reports from `playwright-report/` and `test-results/`.
