# 🤍 White Dreams™ Automator

<div align="center">

### Search. Discover. Download. Automate.

**White Dreams™ Automator** is a modern Windows desktop application that combines content discovery, search, link processing, download management, browser automation, queue control, and application updates in one unified interface.

**Current Release — V3.0.0**

Built with **Electron • Node.js • JavaScript • CloakBrowser**

> **Next generation:** White Dreams™ Nexus V4 is now in active architecture and foundation development.

</div>

---

## ✨ About

White Dreams™ Automator started as a small personal utility for collecting downloadable links and sending them to Internet Download Manager.

It has grown far beyond that original purpose.

Today, Automator includes its own **Search Engine**, **built-in Download Engine**, controlled queue system, source-processing workflows, browser automation, update system, and a modern desktop interface.

Instead of manually opening multiple websites, resolving intermediate pages, collecting file URLs, managing large multipart downloads, and switching between separate utilities, Automator brings those workflows together into one application.

The project is now entering its biggest evolution yet:

> **White Dreams™ Automator → White Dreams™ Nexus**

Nexus V4 will expand the existing foundation into a complete discovery, download, file-management, storage, installation, and game-library platform.

---

# 🚀 Current Release — V3.0.0

V3.5.0 will represents the most advanced Automator release in the V3 generation so far and soon available.

Major capabilities include in V3.5:

* 🔎 Integrated Search Engine
* 🎮 Games-focused search workflows
* 📥 Built-in Download Engine
* 🚀 IDM integration
* 🔗 Automatic link extraction and source processing
* 🧠 Persistent download queue
* 🌐 CloakBrowser-powered browser automation
* 🔄 Automatic application updates
* 🧩 Plugin-based extensibility
* 🛡️ Improved application security
* 🖥️ Modern desktop UI
* ⚠️ Stronger error isolation and recovery

---

# 🔎 Integrated Search Engine

Automator includes an integrated Search workspace inside the main application.

Users can discover supported content without constantly leaving the desktop application.

### Search workflow

```text
User Search
     │
     ▼
Search Engine
     │
     ▼
Provider Plugins
     │
     ▼
Normalized Results
     │
     ▼
Content Selection
     │
     ▼
Source Processing
     │
     ▼
Download Workflow
```

The Search Engine is designed around extensible providers so new sources and content categories can be added without rebuilding the entire application.

---

## 🎮 Games Search

Games are the first major Search Engine content category.

The Search Engine can collect and normalize game metadata from supported providers and present it through the main Automator interface.

The architecture is intentionally separated so:

```text
Search Metadata
      ≠
Download Transport
```

A search provider is responsible for discovering and describing content.

Download resolution and file transfer remain separate responsibilities.

This separation is important for the future Nexus architecture.

---

# 📥 Built-in Download Engine

Automator is no longer limited to sending every download to an external download manager.

V3 includes its own built-in Download Engine for managed transfers.

The current engine provides the foundation for:

* Managed file downloading
* Queue-controlled transfers
* Download progress reporting
* Failure handling
* Download cancellation
* Destination management
* Integration with Automator workflows

Internet Download Manager remains available as an external download option where appropriate.

### Current architecture

```text
Resolved Download
       │
       ├──────────────► Built-in Download Engine
       │
       └──────────────► Internet Download Manager
```

The built-in engine is an important milestone, but it is also one of the main systems being completely redesigned for White Dreams™ Nexus V4.

---

# 🧠 Download Queue

Downloads are managed through a controlled queue instead of being launched unpredictably.

The queue is useful for:

* Large file sets
* Multipart archives
* Sequential workflows
* 50+ or 100+ discovered files
* Retryable failures
* Large game-download workflows
* Persistent job state

The queue keeps the application usable while background work is being prepared or processed.

---

# 🚀 Internet Download Manager Integration

Automator still supports handing resolved download URLs to **Internet Download Manager (IDM)**.

IDM remains useful for users who prefer an established external download manager.

Typical IDM capabilities include:

* Pause / Resume
* Download recovery
* Connection management
* Multipart downloading
* Scheduling
* Bandwidth control

IDM is no longer the long-term center of the White Dreams architecture.

The goal of Nexus Download Engine 2 is to bring advanced download-management capabilities directly into the application while keeping user control.

---

# 🌐 CloakBrowser Integration

White Dreams™ Automator uses **CloakBrowser** for supported browser-automation workflows.

A valid CloakBrowser license key must be configured before browser-dependent operations are started.

## Getting a CloakBrowser key

Visit:

```text
https://cloakbrowser.dev/free/
```

Sign in using your GitHub account.

Your CloakBrowser license key should be delivered to your registered email address.

Then open:

```text
Settings
└── Browser Connection
    └── CloakBrowser License Key
```

Paste the license key and save the configuration.

> [!IMPORTANT]
> Configure CloakBrowser before starting workflows that require browser automation.
>
> This helps avoid unnecessary browser initialization or Chromium downloads.

If saving fails, try saving the key again.

If the problem continues, please report the issue.

---

# 💡 Setup Assistance

Automator checks whether the required CloakBrowser configuration exists.

If no configured key is detected, the application can display setup/help information explaining how to connect CloakBrowser.

Help remains available from inside the application after setup.

---

# 🔄 Automatic Updates

White Dreams™ Automator includes an integrated updater.

The update flow is designed to keep the user in control:

```text
Check for Update
       ↓
New Version Found
       ↓
Ask Permission
       ↓
Download Update
       ↓
Show Progress
       ↓
Restart and Install?
       ↓
Safely Close Automator
       ↓
Install
       ↓
Launch Updated Version
```

The updater is designed to:

1. Check for available releases.
2. Compare the installed and available versions.
3. Ask before downloading.
4. Display download progress.
5. Ask before installation.
6. Safely stop and persist managed application work.
7. Install the update.
8. Start the updated application.

Automator does **not** silently install application updates without user interaction.

---

# 🖥️ User Interface

The V3 generation transformed Automator from a script-oriented utility into a real desktop application.

The main shell provides access to areas such as:

* Search
* Downloads
* Queue information
* Settings
* Browser configuration
* Help
* Updates
* About information
* Theme controls

The application is designed to remain responsive while background workflows continue running.

---

# 🤍 Design Philosophy

White Dreams™ follows a simple principle:

> **Automate repetitive work without removing user control.**

Automation should reduce unnecessary manual work while keeping important decisions visible.

That applies especially to:

* Search result selection
* Download actions
* Queue control
* Browser automation
* Storage decisions
* Application updates
* Error recovery
* Future installation workflows

---

# 🛡️ Reliability & Error Handling

V3 significantly improved failure isolation across the application.

A single failed operation should not unnecessarily terminate the complete application.

Error handling covers areas such as:

* Search requests
* Search providers
* Browser startup
* Browser connections
* Source processing
* Invalid URLs
* Network failures
* Download operations
* Queue jobs
* External process execution
* IDM communication
* Settings
* Application updates

Persistent or reproducible issues should still be reported so they can be diagnosed and fixed.

---

# 🧩 Plugin Architecture

White Dreams™ Automator is evolving toward a modular architecture.

Plugins and isolated subsystems make it possible to add functionality without tightly coupling every feature to the application shell.

Current and planned plugin-oriented areas include:

* Search providers
* Search categories
* Source processors
* Download resolvers
* File-management workspaces
* Metadata processors
* Future lifecycle integrations

The long-term goal is to keep core services reliable while specialized modules provide source-specific behavior.

---

# ⚙️ Requirements

## Normal users

Recommended environment:

```text
Operating System : Windows 10 / Windows 11
Architecture     : x64
Internet         : Required for online operations
CloakBrowser     : Required for supported browser workflows
IDM              : Optional / supported external download manager
```

Packaged builds contain the required Electron/Node runtime.

Normal users should **not** need to install Node.js separately.

---

# 🛠️ Development

## Main technology

```text
Electron
Node.js
JavaScript
HTML
CSS
CloakBrowser
SQLite
```

Additional internal modules are used for browser automation, search, downloading, queue persistence, source extraction, desktop integration, application updates, and plugin loading.

---

## Clone the Repository

```bash
git clone https://github.com/s-shavishan/White-Dreams-Automator.git
```

Enter the project:

```bash
cd White-Dreams-Automator
```

Install dependencies:

```bash
npm install
```

Start the application:

```bash
npm start
```

Development/browser mode may also be available depending on the scripts defined in the current `package.json`.

---

# 📂 Simplified Project Architecture

```text
White-Dreams-Automator/
│
├── core/
│   ├── download.js
│   ├── queue.js
│   ├── updates.js
│   ├── version.js
│   ├── plugins.js
│   └── ...
│
├── Plugins/
│   ├── search_engine/
│   └── ...
│
├── public/
│   ├── assets/
│   ├── index.html
│   ├── app.js
│   ├── style.css
│   └── ...
│
├── scripts/
│   ├── serve.js
│   └── ...
│
├── tests/
│   └── ...
│
├── main.js
├── server.js
├── package.json
└── README.md
```

The internal structure may change as the Nexus V4 architecture is introduced.

---

# 🏗️ Current Architecture

```text
┌──────────────────────────────────────────────┐
│          White Dreams™ Automator V3         │
├──────────────────────────────────────────────┤
│                  App UI                      │
│                                              │
│       Search • Downloads • Settings          │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│         Application / Server Layer           │
└───────────────┬─────────────────┬────────────┘
                │                 │
       ┌────────▼──────┐   ┌──────▼─────────┐
       │ Search Engine │   │ Download System│
       └────────┬──────┘   └──────┬─────────┘
                │                 │
       Provider Plugins      Queue / Engine
                │                 │
                ▼                 ├────► Built-in Downloader
        Normalized Results        │
                                  └────► IDM
```

This separation is the foundation for the next-generation architecture.

---

# 🔐 Security

Desktop automation software interacts with websites, local files, browsers, and external applications.

White Dreams™ therefore follows defensive design principles including:

* Sandboxed Electron renderer
* Context isolation
* Restricted in-app navigation
* External web links opening in the user's normal browser
* Controlled handling of `http`, `https`, and `mailto`
* Same-origin application APIs
* Validation of supported input
* Controlled external-process execution
* Plugin failure isolation
* Explicit confirmation for sensitive update actions
* No unnecessary renderer access to Node.js or the filesystem

Users should only install releases obtained from the official project repository.

---

# 🏷️ Version Management

Current release:

```text
V3.0.0
```

Application versioning should use the version defined in:

```text
package.json
```

with project version helpers propagating that value throughout the application.

Avoid introducing duplicate hard-coded version strings in files such as:

```text
main.js
server.js
core/download.js
core/queue.js
scripts/serve.js
public/index.html
```

`package.json` should remain the canonical version source.

---

# 📦 Releases

Official builds should be distributed through **GitHub Releases**.

A release may contain:

* Release notes
* New features
* Bug fixes
* Breaking changes
* Installation packages
* Auto-update assets
* Known issues

Stable users should preferably install official packaged releases rather than running raw development source.

---

# 📝 Release Channels

White Dreams™ uses semantic-style versioning:

```text
MAJOR.MINOR.PATCH
```

and development identifiers where necessary.

Examples:

```text
3.5.0-beta.2
4.0.0-alpha.1
4.0.0-beta.1
4.0.0-rc.1
4.0.0
```

### MAJOR

Large architectural or product-generation changes.

### MINOR

Significant functionality added within the same major generation.

### PATCH

Bug fixes, maintenance, and smaller improvements.

### Alpha / Beta / RC

Pre-release stages used while major new architecture is being implemented and validated.

---

# 🌌 The Next Generation — White Dreams™ Nexus V4

Automator has grown beyond the meaning of the word **Automator**.

The next major generation is being developed as:

# **White Dreams™ Nexus**

Nexus is intended to connect the complete local game/content workflow:

```text
DISCOVER
   ↓
DOWNLOAD
   ↓
RECOVER
   ↓
MANAGE FILES
   ↓
MANAGE STORAGE
   ↓
VERIFY
   ↓
EXTRACT
   ↓
INSTALL
   ↓
LIBRARY
   ↓
PLAY
```

The existing V3 application remains the foundation.

Nexus is an evolution of the same project rather than an unrelated replacement.

---

# 🚀 Nexus V4 Planned Architecture

```text
                    White Dreams™ Nexus

                           App Shell
                               │
                         Nexus Core
                               │
       ┌──────────────┬────────┼────────┬──────────────┐
       │              │        │        │              │
     Search        Download   Files   Install       Library
     Engine        Engine 2   Engine   Engine        Engine
       │              │        │        │              │
       │          Recovery     │        │              │
       │          Scheduler    │        │              │
       │          Bandwidth    │        │              │
       │          Segments     │        │              │
       │              │        │        │              │
       └──────────────┴────────┴────────┴──────────────┘
                               │
                       Lifecycle Coordinator
```

---

# ⚡ Nexus Download Engine 2

One of the largest Nexus projects is a complete redesign of the built-in Download Engine.

Planned capabilities include:

* True pause / resume
* Persistent `.wdpart` partial downloads
* Crash recovery
* Windows-restart recovery
* HTTP Range-based transfers
* Source validation
* ETag / Last-Modified recovery protection
* Multipart / segmented downloading
* Dynamic segment splitting
* Reusable HTTP connections
* Advanced retry policies
* Intelligent queue scheduling
* Per-host connection limits
* Global connection limits
* Download groups
* Mirror/source support
* Bandwidth profiles
* Real-time speed limiting
* User-controlled percentage allocation
* Fixed-speed limits
* Smart bandwidth mode

The goal is not to magically create bandwidth.

The goal is to use available network capacity efficiently while giving the user precise control.

---

# 🎚️ Nexus Bandwidth Control

Planned Download Engine profiles include:

```text
Unlimited
Percentage
Fixed Speed
Smart
```

Example:

```text
Connection reference : 100 Mbps
Nexus allocation     : 90%
Target               : ~90 Mbps
```

The percentage represents the amount of measured/configured bandwidth Nexus is allowed to target.

It is **not** a firewall reservation or guarantee from Windows, the router, or the ISP.

---

# 📁 Nexus Files

Nexus V4 is planned to introduce a dedicated File Manager rather than relying only on Windows Explorer.

Planned features include:

* Modern file navigation
* Tabs
* Dual-pane workflows
* Favorites
* Recent locations
* Persistent file operations
* Copy / Move / Rename / Recycle
* Crash-recoverable operation journal
* Download-aware file protection
* Storage analytics
* File indexing
* Fast local search
* Duplicate detection
* Archive awareness
* Download-group integration

The File Manager is designed to understand Nexus downloads instead of treating every file as unrelated data.

---

# 💾 Nexus Storage Engine

Planned storage capabilities include:

* Drive usage
* Folder-size analysis
* Storage categories
* Download reservations
* Installation reservations
* Queue-space forecasting
* Safety reserves
* Duplicate candidates
* Large-file analysis
* Storage cleanup suggestions

Example:

```text
Physical free          284 GB
Download reservations   68 GB
Install reservations   105 GB
Safety reserve          10 GB
─────────────────────────────
Nexus available        101 GB
```

---

# 📦 Archive & Integrity Engine

Nexus is planned to understand multipart archive sets such as:

```text
Game.part01.rar
Game.part02.rar
Game.part03.rar
...
```

as a single logical download/archive set.

Planned capabilities include:

* Archive-set detection
* Archive inspection
* Archive testing
* Safe staged extraction
* Extraction recovery
* SHA-256 hashing
* Provider hash verification
* Path-traversal protection
* Install-readiness detection

Nexus will distinguish between:

```text
Archive structurally valid
```

and:

```text
Expected cryptographic hash matched
```

because those are different guarantees.

---

# 🛠️ Nexus Installer Engine

Planned installer support includes:

* Portable games
* Executable installers
* MSI installers
* Existing extracted installations
* Interactive installation tracking
* Storage checks
* Staged portable installations
* Installation-result detection
* Signature information
* Installer process monitoring
* Safe handoff to the Library

Nexus itself should normally remain a non-administrator application.

Operations requiring elevation should use Windows' normal elevation mechanisms rather than running the entire app permanently as administrator.

---

# 🎮 Nexus Game Library

The planned Library will provide:

* Installed-game records
* Multiple installations per game
* Existing-game import
* Launch profiles
* Local playtime tracking
* Installation state monitoring
* Missing-game detection
* Open installation location
* Managed portable uninstall
* Official uninstaller integration where available
* Search / Download / Install identity links

A local game will remain usable in the Library even if it was not originally discovered through the Search Engine.

---

# 🧭 Nexus V4 Development Roadmap

The planned implementation sequence is intentionally staged.

```text
4.0.0-alpha.1
Nexus Foundation
        │
        ▼
4.0.0-alpha.2
Resumable Single-Stream Download Engine
        │
        ▼
4.0.0-alpha.3
Recovery Hardening
        │
        ▼
4.0.0-alpha.4
Multipart Acceleration
        │
        ▼
4.0.0-alpha.5
Bandwidth + Intelligent Scheduler
        │
        ▼
4.0.0-alpha.6
Advanced Queue + Download Groups
        │
        ▼
4.0.0-alpha.7
Nexus Files
        │
        ▼
4.0.0-alpha.8
Storage + Indexing
        │
        ▼
4.0.0-alpha.9
Archives + Integrity
        │
        ▼
4.0.0-beta.1
Installer Engine
        │
        ▼
4.0.0-beta.2
Game Library
        │
        ▼
4.0.0-beta.3
Full Lifecycle Integration
        │
        ▼
4.0.0-rc.1
Hardening / Migration / Torture Testing
        │
        ▼
4.0.0
White Dreams™ Nexus
```

Roadmap items may change as testing and development reveal better engineering decisions.

---

# 🔁 Upgrade Philosophy

White Dreams™ Nexus is intended to evolve from Automator without unnecessarily breaking existing users.

During the V4 transition, the project should preserve compatible application/update lineage wherever necessary for:

* Existing installations
* User data
* Settings
* Search data
* Update delivery
* Migration safety

Visible branding can evolve to **White Dreams™ Nexus** while internal installation identity is changed only when doing so is proven safe.

---

# 🐛 Bug Reports

Found a problem?

Please include:

```text
Application Version:
Windows Version:
Download Engine:
What you were doing:
What you expected:
What actually happened:
Error message:
Screenshots / logs:
Steps to reproduce:
```

Detailed reproduction steps make bugs significantly easier to diagnose.

---

# 💡 Feature Requests

Feature ideas are welcome.

Useful requests explain:

* The problem being solved
* Expected behavior
* Where the feature belongs
* Which subsystem it affects
* Any reliability or UX concerns

Potential areas include Search, Downloads, Files, Storage, Installer, Library, Plugins, UI, and Updates.

---

# 🤝 Contributing

Contributions, testing, bug reports, and suggestions are appreciated.

Possible areas include:

* Bug fixes
* UI improvements
* Search providers
* Source adapters
* Download-engine testing
* Error handling
* Documentation
* Performance improvements
* Security improvements
* Nexus subsystem development

For major architectural changes, discussion before implementation is strongly recommended.

---

# ⚠️ Responsible Use

White Dreams™ Automator and White Dreams™ Nexus are intended for legitimate automation and download workflows.

Users are responsible for how they use the software.

Please respect:

* Copyright
* Software licenses
* Website terms
* Access controls
* Content ownership
* Local laws

Use download/search functionality only with content and services you are authorized to access.

The project is not intended to bypass DRM, access controls, licensing systems, or other protection mechanisms.

---

# ❓ Troubleshooting

### CloakBrowser does not start

Verify that the license key is configured under:

```text
Settings
→ Browser Connection
→ CloakBrowser License Key
```

### CloakBrowser key does not save

Try saving again.

If the problem remains, restart the application and report the exact error message.

### Built-in download fails

Check:

* Internet connectivity
* The source URL is still valid
* Destination storage is available
* The application has access to the destination folder

Retry the download if appropriate and report reproducible failures.

### IDM does not receive downloads

Check:

* IDM is installed
* The configured IDM path is correct
* IDM launches normally
* The resolved URL has not expired

### Search returns no results

A provider may be offline, its structure may have changed, or your network may be temporarily unavailable.

Try again and report persistent provider-specific problems.

### External links do not open

Normal `http`, `https`, and `mailto` links should open through the system's default browser or mail application instead of loading inside the protected Automator renderer.

---

# 📧 Contact

## Developer

**S. Shavishan — Shan**

**White Dreams™ 🤍**

For development discussions, contributions, or other project inquiries:

```text
shavishan.official@gmail.com
```

For reproducible application bugs, GitHub Issues are preferred.

---

# 🤍 Support the Project

White Dreams™ is developed as a free project.

You can help by:

* ⭐ Starring the repository
* 🐛 Reporting bugs
* 💡 Suggesting improvements
* 🧪 Testing pre-release builds
* 🤝 Contributing code
* 📖 Improving documentation
* 📢 Sharing the project

Every useful report helps improve the project.

---

<div align="center">

# White Dreams™ 🤍

### Discover more. Automate the repetitive. Keep control.

New stable build will soon available - **White Dreams™ Automator — V3.5.0**

### The road to White Dreams™ Nexus V4 has begun.

Made in Sri Lanka 🇱🇰

</div>
