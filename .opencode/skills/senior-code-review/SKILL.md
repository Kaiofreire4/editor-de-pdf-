---
name: senior-code-review
description: Use when reviewing diffs, pull requests, refactors, bug fixes, or proposed changes in this PDF editor; prioritize correctness, regressions, security, maintainability, and missing tests.
---

# Senior Code Review

Review the actual diff and the surrounding call sites before judging a change.
Findings are more important than summaries.

## Review order

- Check behavior changes at API, routing, file-processing, persistence, and UI boundaries.
- Trace data from user input to PDF libraries, SQLite, filesystem, and HTTP responses.
- Look for invalid states, race conditions, resource leaks, stale object URLs, and page-index or coordinate mismatches.
- Verify error paths, loading states, empty states, cancellation, and repeated execution.
- Check that tests cover the changed behavior and the highest-risk failure mode.

## Findings

- Report only actionable issues with concrete file and line references.
- Order findings by severity: production breakage or data loss, security/privacy, incorrect behavior, then maintainability.
- Explain the trigger, impact, and smallest safe fix.
- Do not report stylistic preferences unless they create a real defect or materially increase risk.
- If no findings exist, state that explicitly and mention residual testing gaps.

## Project-specific risks

- Keep Angular UI page numbers 1-based and API/PDF page indexes 0-based.
- Verify top-left browser coordinates are converted correctly for pdf-lib's bottom-left origin.
- Treat uploaded files, multipart fields, JSON modifications, route params, and local storage as untrusted.
- Ensure API errors do not leak stack traces, paths, PDF content, credentials, or user data.
- Treat generated `dist`, database files, uploaded documents, and environment files as non-source artifacts.
