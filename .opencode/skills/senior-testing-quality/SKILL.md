---
name: senior-testing-quality
description: Use when adding tests, debugging failures, validating PDF features, or deciding verification for Angular, Express, pdf-lib, pdfjs-dist, SQLite, and Netlify behavior in this repository.
---

# Senior Testing And Quality

Prefer focused, deterministic tests that protect user-visible behavior and
the boundaries most likely to corrupt documents.

## Test strategy

- Start with a small regression test for every bug fix.
- Test pure validation, page-range handling, coordinate conversion, text lookup,
  unchanged modifications, and malformed input without starting a server.
- Test Angular services and components through public behavior, not private
  implementation details.
- Use real small PDFs for integration coverage of rendering, extraction,
  editing, merging, extraction, and downloads when mocks would hide library
  incompatibilities.
- Cover both success and failure paths, including empty files, invalid PDFs,
  missing fields, duplicate actions, and multi-page documents.
- Keep tests independent: no reliance on a developer's `.data` database,
  browser state, network, or test execution order.

## Commands

- Run `npm test -- --watch=false` for the current automated suite.
- Run `npm run build` to catch Angular and shared TypeScript errors.
- Run `npm run check:environment` when native dependencies or local setup are relevant.
- Exercise `GET /api-docs`, `POST /extrair-textos`, and `POST /salvar-pdf` for API contract changes.

## Quality gates

- Do not weaken production validation to make an old test pass.
- Assert status codes, content types, response shapes, and that failed requests
  do not create files, corrupt PDFs, or leave resources allocated.
- For browser resources, verify object URLs and pdf.js documents are released.
- If manual verification is required, record the PDF shape used and whether the
  API was running; do not claim an unrun check passed.
