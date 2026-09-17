# ScholarMCP release review

Reviewed the current remote `main` at `0768dce` after fetching and fast-forwarding
the local checkout from `81393f0`. Scope: the MCP runtime, research services,
package contents, GitHub Actions, release script, and docs site.

| Area | Result | Evidence |
| --- | --- | --- |
| MCP | Correctness and resource-handling defects fixed | [Runtime review](per-project/2026-09-18_scholar-mcp.md) |
| Docs | Stale generated reference, release drift, broken links, and dependency mismatch fixed | [Docs review](per-project/2026-09-18_docs.md) |
| Publication | npm OIDC runtime and GitHub scoped publication corrected; both workflows verify installed version | `.github/workflows/publish*.yml` |

The previous docs failure was reproducible from stale `year_range` descriptions.
Release-tag creation could also change the generated release index after the
release commit. The generator now produces identical content before and after
the current version's tag and ignores tags beyond the checked-out commit.

The previous npm workflow failed with E404. It intended to use trusted publishing
but used an older npm runtime. The repaired workflow uses Node 24 and npm 11,
requests an OIDC token, and avoids a placeholder registry token. This follows
[npm's trusted publisher requirements](https://docs.npmjs.com/trusted-publishers/).
The user's existing npm trust configuration remains the authority; only a
successful publication proves that it accepts this workflow.

The GitHub Packages workflow renamed the package before invoking a filter using
the old name. It now publishes directly from the package directory. Both
workflows query the exact published version and install it in a temporary
directory to run `scholar-mcp --version`. A green preflight alone is not proof
of publication.

The release script checks both projects, creates the version commit and tag,
checks generated-doc stability after tagging, and atomically pushes the branch
and tag before creating the GitHub release.

Verification: 68 MCP tests, two generator regressions, TypeScript checking,
package dry run, static docs build, browser navigation/search, and local link
inspection. The refreshed full dependency audit reports zero known advisories
on 2026-09-18. Audit counts are dependency-database results, not proof that the
original application was exploitable or that the updated application has no
security defects.

External provider availability, live GROBID behavior, and sustained multi-user
load were not established by this review. Registry publication and website
deployment are verified separately against their actual CI results.
