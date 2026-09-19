# White Dreams™ | Automator

**Version 3.0.0**

A polished download workspace with a persistent queue, a built-in transfer engine, optional IDM hand-off, and actionable errors.

V3 is prepared for GitHub with automated tests and a Windows packaging configuration.
It does not contain a compiled or signed installer. Desktop, provider, 
and final rendered verification still need to be completed on Windows.

## Start on Windows

Use Node.js 24.15 or later in the Node 24 series, with npm. Extract this ZIP into its own folder. In PowerShell, open that folder and run:

```powershell
cd .\White-Dreams-Automator-3.0.0
npm ci
npm start
```

`npm ci` installs the pinned dependencies and Electron. It needs an internet connection.The supported Node ranges are also declared in `package.json`.

1. Open **Settings** and choose a writable download folder.
2. Leave **Download engine** on **Built-in** for managed transfers.
3. Choose **Add links**, paste direct HTTP(S) file URLs, then start the selected files.
4. For the existing supported file-page workflow, configure your CloakBrowser license and use **Find files** or import **File-page links**. Complete any site verification yourself in the visible browser window.

Direct links do not require IDM or a CloakBrowser license. Page resolution requires the provider SDK, its browser, a valid license, and a supported file host. A changed provider page may require an adapter update.

## What's new

- Cloud and Midnight themes, local brand artwork, redesigned navigation, responsive panels, compact rows, and reduced-motion support.
- Persistent collection of up to 2,000 files, stable IDs, duplicate detection, search, sorting, status filters, and 50-row pages.
- Real received-byte progress, transfer speed, estimated remaining time when the server supplies a size, and SHA-256 calculation.
- Automatic retries for transient failures, configurable limits, pause after the active file, resume, Stop, and retry of entries needing attention.
- Text/JSON imports, queue exports, a per-file inspector, and redacted diagnostic exports.
- Explicit startup, settings, storage, API, transfer, browser, renderer, and update error paths. Corrupt saved JSON is preserved for inspection.

The full V2 findings and fixes are in [CHANGELOG.md](CHANGELOG.md).

## Download behavior

| Behavior | Built-in engine | IDM engine |
| --- | --- | --- |
| Transfers | Sequential, managed by Automator | Handed to the installed IDM application |
| Completion | Stream ended; supplied length and optional expected SHA-256 checked | Reported as **Sent to IDM**; completion is unverified |
| Progress | Received bytes, speed, and ETA when possible | No IDM transfer telemetry |
| Pause | Finishes the current file, then waits | Pauses further hand-offs |
| Stop | Cancels the active transfer and remaining selected work | Stops further hand-offs; stop accepted transfers in IDM |
| Retry | Restarts the file from the beginning | No automatic retry of a possibly accepted hand-off |
| Existing files | Preserved; adds a numeric suffix on collision | Unique proposed names, with IDM confirmation enabled |

The built-in engine requests the original uncompressed response, rejects HTML pages, and writes a private temporary file before completion. Files with unknown lengths can still be downloaded, but byte percentages and size validation are unavailable. A computed checksum is not proof of authenticity; provide a trusted expected hash when that comparison matters.

The collection is restored after reopening. Interrupted work is marked for review and does not start automatically. Removing queue entries never deletes completed files. Retries do not resume partial bytes. A force-killed process may leave a `.wd-*.part` file in the download folder; V3 does not delete files from an earlier process automatically.

For IDM, choose **IDM** in Settings and browse to your installed `IDMan.exe` if auto-detection does not find it. IDM is Windows-only. Its own transfer scheduling and confirmations remain under IDM's control.

## Import and export

Paste one URL per line or choose a `.txt` / `.json` file smaller than 900 KB. The API also enforces a 1 MB request limit. JSON accepts an array or an object containing `files`:

```json
{
  "files": [
    {
      "name": "sample.zip",
      "url": "https://example.com/assets/sample.zip",
      "kind": "direct"
    }
  ]
}
```

That URL is an illustrative placeholder. Replace it with your own direct file URL. Optional `sha256` must be a 64-character hexadecimal hash. Supported `kind` values are `direct` and `page`. JSON metadata takes precedence over the import dialog's default kind.

Exports include selected entries, or the entire collection when none are selected. Exported completed entries can be imported into a fresh collection, with their computed hash used as the expected hash. Imports create queued entries; exports are not a restore of execution history. Duplicate source URLs are skipped even if their filenames differ.

**Select filtered** selects all matching entries across pages. Selections persist while switching filters. Press `Ctrl+K` to search and `Ctrl+L` to add links.

## Data and connection handling

Settings and the queue are local. Queue files and queue exports contain source URLs, which can include access tokens. Activity logs redact URLs and secret assignments; diagnostics omit license values, source URLs, and configured paths. Filenames may still appear in diagnostics, so review an export before sharing it.

Desktop license saving uses Electron's OS encryption when available. V3 does not save a newly entered key as plaintext if encryption is unavailable. This is OS-account protection, not isolation from every program running as the same user. The browser provider can receive the key for license validation.

The UI loads local assets. The app's server binds only to `127.0.0.1` and checks its host, request origin, session cookie, and mutation token. The built-in engine rejects local/private destinations and validates DNS results and redirects. The provider browser has URL checks but is not a DNS-pinned network sandbox. Downloads, provider operations, and explicit update checks contact their respective services.

## Development and packaging

```powershell
npm run check
npm test
npm run test:dom
npm run pack
npm run dist
```

Run Windows packaging on Windows. `pack` creates an unpacked application; `dist` targets an x64 NSIS installer under `dist`.
Both use `--publish never`. Code signing and publishing are not configured by this release. The existing GitHub release-feed configuration is retained;
update checks are explicit and never automatically download/install an update.

For a browser-only development session, run `npm run serve` and open the printed loopback URL. This mode has no native folder chooser or OS license encryption.
`WD_CONFIG_DIR` can select an isolated data directory, `WD_PORT` an optional local port, and `WD_LICENSE` an optional session environment key.
Use the desktop app for normal Windows operation.


---
RFC | White Dreams | SHAN
---
