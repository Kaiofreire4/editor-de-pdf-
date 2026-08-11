---
name: senior-security-operations
description: Use when changing authentication, uploads, CORS, SQLite, local storage, Express middleware, deployment, environment variables, or handling security and privacy risks in this PDF editor.
---

# Senior Security And Operations

Assume PDFs, DOCX files, filenames, form values, local storage, and request
headers are attacker-controlled. Preserve the local-first product behavior
without treating localhost as a security boundary.

## Input and file safety

- Validate size, MIME type, content signature, and structure before parsing.
- Use strict allowlists for numeric ranges, page indexes, coordinates, and JSON shapes.
- Never build shell commands, SQL, filesystem paths, or HTML from raw user input.
- Keep uploads in memory where practical; if temporary files are required,
  generate safe names and clean them in success and failure paths.
- Do not log document contents, access tokens, passwords, absolute paths, or
  personally identifying data.

## Web and auth safety

- Configure CORS to explicit origins and make environment overrides deliberate.
- Use secure session/token handling, consistent auth guards, and deny-by-default
  behavior for protected routes.
- Avoid trusting client-side auth or local storage for authorization decisions.
- Escape or sanitize imported document content before rendering it as HTML.
- Ensure error responses expose safe messages only; keep diagnostics server-side.

## Operations

- Keep secrets and local databases out of source control and generated output.
- Check Node/npm engine compatibility before changing dependencies.
- Review Netlify functions and local Express behavior together when an endpoint
  is shared across deployments.
- For changes affecting persistence or uploads, define cleanup, size limits,
  failure recovery, and backward-compatibility behavior before implementation.

## Verification

- Test malformed multipart data, oversized files, invalid JSON, invalid pages,
  unauthorized access, disallowed origins, and error disclosure.
- Run `npm run build` and inspect the final diff for credentials, generated
  artifacts, database files, and accidental broad permission changes.
