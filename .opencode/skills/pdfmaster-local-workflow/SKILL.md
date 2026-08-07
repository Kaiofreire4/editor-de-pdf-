---
name: pdfmaster-local-workflow
description: Use when installing, running, testing, building, debugging, or reviewing the PdfMasterWeb repository, including Node/npm setup, Angular CLI, the local Express API, and frontend-backend integration.
---

# PdfMaster Local Workflow

## Requirements

- Node.js 20 or newer and npm are required.
- Install dependencies with `npm install` from the repository root.
- The repository uses npm lockfile versioning; prefer `npm ci` for clean reproducible installs when `package-lock.json` is current.

## Run locally

Start the API in one terminal with `npm run server` or `npm run server:dev`. It listens on port `8000` unless `PORT` is set. Start Angular in another terminal with `npm start`; it serves on port `4200`.

The editor currently calls `http://127.0.0.1:8000` directly. If the API URL changes, update all frontend call sites together and verify CORS behavior.

## Checks

- `npm run build` validates the production Angular build.
- `npm test -- --watch=false` runs the automated tests without an interactive watcher.
- `npm run server` validates that the TypeScript API starts; use `/api-docs` to inspect the contract.
- Before considering a PDF feature complete, verify loading, rendering, editing, downloading, merging, and page extraction with real PDFs.

## Change discipline

- Keep frontend and backend contract changes synchronized.
- Add or update focused tests beside the affected Angular component or service.
- Do not commit generated build output, uploaded PDFs, credentials, or local environment files.
- Report whether the API was running when frontend integration behavior was tested.
