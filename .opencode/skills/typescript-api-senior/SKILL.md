---
name: typescript-api-senior
description: Use when designing, reviewing, testing, or fixing TypeScript APIs, Express endpoints, request validation, PDF processing, error handling, security, and frontend API contracts in this repository.
---

# Senior TypeScript API Development

Use this skill for all backend work in `src/server`, API consumers in Angular,
and changes to the PDF API contract.

## Engineering standards

- Keep strict TypeScript types at the HTTP boundary. Treat multipart fields,
  query strings, and JSON bodies as untrusted `unknown` data.
- Separate transport validation, domain logic, and response formatting when a
  function becomes difficult to test.
- Return stable JSON errors with an appropriate 4xx status for client input;
  never turn malformed JSON, missing files, invalid ranges, or invalid indexes
  into a 500 response.
- Do not expose stack traces, filesystem paths, PDF contents, or upload names
  in error responses. Log diagnostics server-side without file contents.
- Bound request body and upload sizes, validate PDF input before processing,
  and configure CORS to the known local frontend origins.
- Keep PDF data in memory unless persistence is explicitly required. Release
  pdf.js documents and object URLs when their lifecycle ends.
- Prefer explicit result types and small pure helpers for coordinate conversion,
  validation, text matching, and page range handling.
- Preserve API response compatibility unless a contract change is intentional;
  update Swagger and every frontend consumer together.

## API checklist

- Validate required multipart fields and MIME/content signatures.
- Parse integers strictly; reject values such as `1abc`, decimals, negatives,
  and out-of-range page indexes.
- Parse JSON with a dedicated 400 response and validate array item shapes,
  finite numeric coordinates, positive dimensions, and page bounds.
- Make errors consistent: `{ "error": "..." }` for JSON failures and a binary
  `application/pdf` response only on success.
- Avoid broad `cors()` in production. Allow `http://localhost:4200` and
  `http://127.0.0.1:4200` for local development, with an environment override.
- Export the Express app separately from the listener so endpoint tests can
  use it without opening a port.
- Keep Swagger annotations synchronized with fields, status codes, and
  response content.

## Verification

- Run `npm.cmd run build`.
- Run `npm.cmd run server` and exercise `/api-docs`, `/extrair-textos`, and
  `/salvar-pdf` with valid and malformed multipart requests.
- Add focused tests for validation, coordinate conversion, page bounds, and
  unchanged modifications. Do not weaken production validation to satisfy old
  generated Angular placeholder specs.
