---
name: pdfmaster-angular-frontend
description: Use when changing the Angular 22 frontend, standalone components, routes, PdfManager, PDF canvas rendering, ngx-quill editing, upload flows, merge/cut actions, or frontend styles in this PDF editor.
---

# PdfMaster Angular Frontend

Use the existing Angular standalone architecture. Relevant areas are:

- `src/app/components/editar-texto/` for PDF rendering, text-span selection, Quill editing, and export.
- `src/app/components/visualizar-pdf/` for PDF viewing.
- `src/app/components/organizar-pdf/` for client-side PDF merge and page extraction.
- `src/app/services/pdf-manager.ts` for reusable PDF loading and editing operations.
- `src/app/app.routes.ts` and `src/app/app.config.ts` for application wiring.

## Conventions

- Keep components standalone and declare every template dependency in the component `imports` array.
- Use Angular and TypeScript types instead of adding new `any` values. Preserve existing `any` only where third-party PDF typings require it.
- Keep PDF page indexes explicit: UI pages are 1-based, API `pageIndex` values are 0-based.
- Keep coordinate conversions explicit. The editor scales screen bboxes by `escala`; convert them back to PDF points before sending `/salvar-pdf`.
- Configure the `pdf.js` worker consistently with the installed `pdfjs-dist` version. Do not silently mix worker major versions.
- Revoke object URLs created with `URL.createObjectURL` when their lifecycle ends.
- Validate file presence, page ranges, and PDF operation failures before starting downloads.
- Preserve the existing Portuguese UI language and component naming style.

## Verification

Run `npm run build` after frontend changes. Run `npm test -- --watch=false` when changing component behavior or `*.spec.ts` files. Test manually with a multi-page PDF for rendering, page navigation, text replacement, merge, crop, and download.
