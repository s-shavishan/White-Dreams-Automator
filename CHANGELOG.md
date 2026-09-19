# V3.0.0 — changes

## Prime UI revision — 19 September 2026

- Replaced the accumulated interface overrides with a unified Cloud/Midnight visual system, responsive layouts, refined dialogs, stronger queue hierarchy, and polished empty/running/result states.
- Added a branded workspace hero and direct-link composer while keeping all assets local and preserving reduced-motion behavior.
- Canonicalized accepted public URLs before duplicate checks, including fragment removal and default-port normalization.
- Removed unconditional resolver URL logging, guarded malformed Electron navigation, and blocked credential-bearing HTTP(S) external links.
- Added an explicit **Finished with attention** batch result, synchronized the theme icon and browser chrome color, and corrected provider-license guidance.
- Updated the optional UI smoke fixture so first-run onboarding does not obscure its queue-focused scenarios.

## V2 findings addressed

| V2 finding | V3 implementation |
| --- | --- |
| IDM executable hardcoded to `H:\IDMan.exe`; saved path unused | Saved path is used; Windows discovery and native Browse are connected |
| Circular imports and configuration evaluated before the intended path was set | Configuration is explicitly constructed after Electron readiness |
| License stored in plaintext while described as secure | OS-encrypted storage when available; explicit migration and unavailable-storage messages |
| Stable file size interpreted as completion, including stalled or old files | Built-in streaming completion with length/hash checks; IDM hand-off stays unverified |
| Client and server IDs differed | Server-owned UUIDs are returned consistently and persisted |
| Starting a selection replaced the full collection | Runs reference selected IDs and retain unselected entries |
| Failure and cancellation totals drifted | Summaries derive from per-file states; processed-item progress includes terminal outcomes |
| Restored/refreshed state could leave stale UI entries | Complete state synchronization plus revisioned progress patches and reconnect |
| Failed requests and clear actions could be swallowed | Structured API errors, inline form errors, a visible error banner, and checked responses |
| Browser could not reliably restart after closure | Owned browser lifecycle, restart, cancellation during launch/page creation, and late-launch cleanup |
| Browser left running after queue completion/exit | Cleanup at extraction completion, queue completion, cancellation, and shutdown |
| Unbounded requests and broad local server exposure | Loopback binding, request/time/client limits, same-origin sessions, static asset allowlist |
| Dynamic HTML escaping incomplete | Dynamic filenames, URLs, statuses, and errors render through text nodes |
| Single-instance registration occurred late | Instance lock acquired before initialization |
| Update errors and background update behavior disrupted startup | Explicit checks, actionable failures, no automatic download/install |
| Installer build tool dependency advisories | Updated pinned dependencies and lockfile; final npm audit reported zero known advisories |
| Small, limited collection interface and remote fonts | Rebuilt local-asset UI with themes, pagination, search, sorting, inspectors, and diagnostics |

## Reliability changes

- Typed errors for connection loss, timeouts, unavailable paths, disk access/full disk, invalid links, corrupt storage, HTTP failures, verification failures, and provider changes.
- Atomic JSON replacement, bounded persisted input, rollback when collection writes fail, and explicit interruption when persistence fails during a run.
- Non-overwriting download finalization, unique temporary files, cleanup owned by the current transfer, redirect validation, and optional SHA-256 verification.
- Bounded retry delays; cancellation observed during network, browser setup, active browser work, and queue waits.
- Browser/renderer crash handling and controlled desktop shutdown with active-work confirmation.
- Safe rendering, bounded activity history, redacted diagnostics, and no source/config exposure through static routes.

## Added features

- Built-in sequential downloader alongside optional external IDM hand-off.
- Pause after file, resume, cancel extraction, Stop queue, and retry attention entries.
- Persistent queue, duplicate detection, text/JSON import, JSON export, and file inspection.
- Received-byte speed/ETA, completed-file hashes, and visible transfer errors.
- Cloud/Midnight/system theme choices, compact display, keyboard shortcuts, and responsive layout rules.
- Native folder/IDM choosers, open-download-folder action, and explicit update checks.

## Intentional behavior changes and limits

V3 defaults to the built-in engine. IDM's command-line interface provides no completion telemetry, so V3 does not label a spawned hand-off as a completed file or wait for a guessed stable size. IDM can accept multiple hand-offs and manages its own downloads.

Retries restart a file rather than resuming partial bytes. Pause takes effect between files. A saved interrupted queue requires user action to restart. The page resolver keeps the existing provider integration and manual site verification; it is not a general resolver for arbitrary file hosts.

The code has automated coverage for these changes, but Windows integration, real licensed provider operations, and rendered UI layout remain unverified in this environment.

## Design references

- [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron safeStorage API and OS protection limits](https://www.electronjs.org/docs/latest/api/safe-storage)
- [IDM command-line interface](https://www.internetdownloadmanager.com/support/command_line.html)
