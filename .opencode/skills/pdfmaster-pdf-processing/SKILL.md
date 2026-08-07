---
name: pdfmaster-pdf-processing
description: Use when changing PDF parsing or editing, Express endpoints, multer uploads, pdfjs-dist text extraction, pdf-lib output, coordinate conversion, Swagger contracts, or the API in `src/server/api-master.ts`.
---

# PdfMaster PDF Processing

The backend is a local TypeScript Express API started with `npm run server` on port `8000`. Its public contract is:

- `POST /extrair-textos`: multipart fields `file` and zero-based `page`; returns `{ spans: [{ text, bbox }] }`.
- `POST /salvar-pdf`: multipart fields `file` and JSON `modificacoes`; returns `application/pdf`.
- `GET /api-docs`: Swagger UI.

## PDF rules

- `pdfjs-dist` reads text and provides page dimensions; `pdf-lib` writes the result.
- Backend bboxes exposed to the frontend use `[x0, y0, x1, y1]` with origin at the top-left. `pdf-lib` drawing uses the bottom-left origin, so convert Y using the page height at the drawing boundary.
- Preserve the fallback path using the frontend bbox when exact text lookup cannot find a span.
- Do not assume one PDF text item equals one visual line. Keep exact, prefix, and bbox fallback behavior deliberate.
- Skip empty or unchanged modifications and reject malformed uploads or page values with a clear 4xx response.
- Keep uploads in memory only unless persistent storage is explicitly required; never log PDF contents or user files.
- Update the Swagger JSDoc whenever request fields, response shapes, status codes, or endpoint behavior changes.

## Reliability and security

- Validate MIME type, file size, parsed JSON, page indexes, and modification bbox dimensions.
- Avoid broad error details in HTTP responses; log diagnostic errors server-side without exposing file data.
- Keep CORS configuration intentional for the Angular origin rather than widening it unnecessarily in production.
- Ensure every loaded PDF and generated resource is released when the chosen library exposes a cleanup API.

## Verification

Run `npm run server` and exercise both endpoints through `http://127.0.0.1:8000/api-docs` or multipart requests. Run `npm run build` to catch shared TypeScript issues and add focused tests for coordinate conversion, page validation, text lookup, and unchanged modifications.
