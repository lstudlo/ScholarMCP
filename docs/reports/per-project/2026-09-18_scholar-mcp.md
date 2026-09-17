# MCP runtime review

Status: Remediated within the trusted-client deployment model. Reviewed remote
`main` at `0768dce` and the changes prepared for 1.2.0.

## Action-item ledger

- [x] Keep OpenAlex credentials out of provenance and authenticate DOI requests.
- [x] Reject unrelated DOI fallback results and preserve distinct research works.
- [x] Match citation years as well as author tokens.
- [x] Bound ingestion downloads and release parser resources on failure.
- [x] Correct IPv6 origin handling and avoid reflecting rejected origins.
- [x] Refresh dependencies and include the license in package contents.
- [x] Verify the merged HTTP response and year-range fixes through a real SDK client.

## Findings and verification

| Priority | Verified failure | Change and evidence |
| --- | --- | --- |
| P1 | `OpenAlexClient.searchWorks` put the API key in a URL later returned as provenance; DOI lookup omitted it. | Use a bearer header in both requests and cap page size at 100. `test/provider-regressions.test.ts` checks headers, request URLs, and returned provenance. [OpenAlex authentication](https://help.openalex.org/api/authentication/) documents header support. |
| P1 | `LiteratureService.resolveByDoi` returned the first search result even with a different DOI. | Require an exact normalized DOI match. Regression verifies unrelated results return `null`. |
| P1 | Literature merging could overwrite same-title records, merge conflicting DOIs, and strip Chinese titles to empty strings. | Preserve Unicode, reject conflicting DOI matches, and use unique map keys. Regression retains six distinct DOI/author/Unicode fixtures. |
| P1 | PDF and landing-page downloads had no size bound or timeout; parser failure skipped cleanup. | Stream with 50 MiB PDF and 2 MiB landing-page limits, apply configured request deadlines, require a PDF signature, and destroy the parser in `finally`. Ingestion tests cover size rejection, MIME spoofing, deadlines, direct PDF URLs, and cleanup. |
| P2 | Author-year citation validation accepted the same author from the wrong year. | Match both fields; the regression reports the missing citation and uncited reference. |
| P2 | IPv6 loopback origins failed hostname comparison; denied origins were reflected in CORS headers. | Normalize IPv6 brackets, allow HTTP(S) schemes only, and omit CORS reflection on rejection. Covered by `test/http-app.test.ts`. |

`test/http-integration.test.ts` starts actual HTTP servers in both session modes,
initializes the MCP SDK client, lists all ten tools, checks the year-range JSON
schema, and executes valid and invalid calls. All 68 runtime tests and
TypeScript checks pass. These tests use controlled provider fixtures; they do
not establish live provider availability.

## Retained boundaries

Jobs/documents remain in memory and shared across clients of one server process.
Remote PDF ingestion can access URLs reachable by that process; local PDF
ingestion can access permitted local files. This is a trusted-user MCP service,
not a tenant-isolated public document service. The docs now state these limits.
Public multi-user hosting would need authorization, network/file restrictions,
job retention, and concurrency controls as a separate design change.

OCR, cloud semantic extraction, and comprehensive citation-style validation are
not implemented. Citation detection is heuristic and does not establish that a
paper supports a manuscript claim. Live GROBID and hostile-PDF CPU isolation
were not verified; download limits do not bound parser CPU time.
