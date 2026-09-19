/** නමෝ බුද්ධාය | 🤍 */

import {app, BrowserWindow, dialog, shell, safeStorage, session, Menu} from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import electronLog from 'electron-log';
import updaterPackage from 'electron-updater';
import {createApplication} from './server.js';
import {asAppError, AppError} from './core/errors.js';

const {autoUpdater} = updaterPackage;
const ROOT = path.dirname(fileURLToPath(import.meta.url));
let window, application, origin, quitting = false, fatal = false, closePrompt = false;
electronLog.transports.file.level = 'info';
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.on('error', () => application?.log.add('warn', 'Update check unavailable. The application can still be used normally.', 'UPDATE_CHECK'));

async function shutdown(exitCode) {
    if (quitting) return;
    quitting = true;
    const deadline = setTimeout(() => app.exit(exitCode || 0), 10000);
    try {
        await application?.close();
    } catch (error) {
        electronLog.error('Shutdown', asAppError(error).code);
    } finally {
        clearTimeout(deadline);
        app.exit(exitCode || 0);
    }
}

function report(error, context) {
    const e = asAppError(error);
    electronLog.error(context, e.code, e.message);
    application?.log.error(e, context);
}

process.on('unhandledRejection', error => {
    report(error, 'Unhandled background task');
    application?.queue.stop();
});
process.on('uncaughtException', error => {
    if (fatal) return;
    fatal = true;
    report(error, 'Fatal error');
    dialog.showErrorBox('White Dreams · Unexpected error', 'The app must close safely. Your saved queue will be available next time.\n\n' + asAppError(error).message);
    void shutdown(1);
});

async function checkUpdates() {
    if (!app.isPackaged) return 'Update checks are available after packaging. This source build is version 3.0.0.';
    try {
        const result = await autoUpdater.checkForUpdates();
        const version = result?.updateInfo?.version;
        return version && version !== app.getVersion() ? `Release ${version} is available in the project GitHub releases. No update has been downloaded.` : 'You are using the current release.';
    } catch {
        throw new AppError('UPDATE_CHECK', 'The release feed could not be reached. Try again later; downloads are unaffected.', {status: 503});
    }
}

function openApprovedExternal(url, context) {
    let target;

    try {
        const parsed = new URL(url);

        if (!['https:', 'http:', 'mailto:'].includes(parsed.protocol) ||
            (parsed.protocol !== 'mailto:' && (parsed.username || parsed.password))) {
            throw new Error('Unsupported protocol');
        }

        target = parsed.toString();
    } catch {
        application?.log.add(
            'warn',
            'An unsupported external link was blocked.',
            'EXTERNAL_LINK_BLOCKED'
        );
        return;
    }

    void shell.openExternal(target).catch(error => report(error, context));
}

async function createWindow() {
    window = new BrowserWindow({
        width: 1500, height: 940, minWidth: 980, minHeight: 680,
        title: 'White Dreams™ | Automator · 3.0.0', backgroundColor: '#f2f5fc',
        autoHideMenuBar: true, show: false, icon: path.join(ROOT, 'build', 'icon.ico'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            spellcheck: false
        },
    });
    window.once('ready-to-show', () => window?.show());

    window.webContents.setWindowOpenHandler(({url}) => {
        openApprovedExternal(url, 'Open external link');
        return {action: 'deny'};
    });

    window.webContents.on('will-navigate', (event, url) => {
        let navigationOrigin;
        try {
            navigationOrigin = new URL(url).origin;
        } catch {
            event.preventDefault();
            application?.log.add('warn', 'A malformed navigation request was blocked.', 'NAVIGATION_BLOCKED');
            return;
        }
        if (!origin || navigationOrigin !== origin) {
            event.preventDefault();
            openApprovedExternal(url, 'Navigate to external link');
        }
    });

    window.webContents.on('context-menu', (event, params) => {
        if (!params.selectionText && !params.isEditable) return;

        const menu = Menu.buildFromTemplate([
            {role: 'copy', enabled: Boolean(params.selectionText)},
            {role: 'paste', enabled: params.isEditable},
            {type: 'separator'},
            {role: 'selectAll'}
        ]);
        menu.popup({window: window});
    });
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    window.webContents.on('did-fail-load', (_, code, description, url, isMainFrame) => {
        if (isMainFrame && code !== -3) application?.log.add('error', 'The interface could not load. Restart the application.', 'UI_LOAD');
    });
    window.webContents.on('render-process-gone', async () => {
        if (quitting || window?.isDestroyed()) return;
        const result = await dialog.showMessageBox(window, {
            type: 'warning',
            title: 'Interface interrupted',
            message: 'The interface stopped responding. Reload it?',
            detail: 'The download queue is managed separately and will reconnect.',
            buttons: ['Reload interface', 'Exit'],
            defaultId: 0,
            cancelId: 1
        });
        if (result.response === 0) window?.loadURL(origin).catch(e => report(e, 'UI recovery'));
        else void shutdown();
    });
    window.on('close', event => {
        if (quitting) return;
        if (application && (application.queue.running || application.publicState().extracting)) {
            event.preventDefault();
            if (closePrompt) return;
            closePrompt = true;
            dialog.showMessageBox(window, {
                type: 'question',
                title: 'Work is still running',
                message: 'Stop the queue and exit?',
                detail: 'The saved queue remains available. IDM transfers must be stopped in IDM.',
                buttons: ['Keep working', 'Stop and exit'],
                defaultId: 0,
                cancelId: 0
            })
                .then(result => {
                    if (result.response === 1) void shutdown();
                })
                .catch(e => report(e, 'Close dialog')).finally(() => {
                closePrompt = false;
            });
        }
    });
    window.on('closed', () => {
        window = null;
    });
    await window.loadURL(origin);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
    app.on('second-instance', () => {
        if (window) {
            if (window.isMinimized()) window.restore();
            window.focus();
        }
    });
    app.whenReady().then(async () => {
        // Explicit construction after app readiness fixes V2's import-time config-path race.
        const codec = safeStorage.isEncryptionAvailable() && !(process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') ? {
            encrypt: value => safeStorage.encryptString(value).toString('base64'),
            decrypt: value => safeStorage.decryptString(Buffer.from(value, 'base64')),
        } : undefined;
        session.defaultSession.setPermissionRequestHandler((_, __, callback) => callback(false));
        session.defaultSession.setPermissionCheckHandler(() => false);
        application = createApplication({
            directory: app.getPath('userData'), codec,
            legacyDirectories: [path.join(os.homedir(), '.white-dreams'), path.join(app.getPath('appData'), 'Automator'), path.join(app.getPath('appData'), 'White Dreams')],
            desktop: {
                pickDirectory: async () => {
                    const result = await dialog.showOpenDialog(window, {properties: ['openDirectory', 'createDirectory']});
                    return result.canceled ? null : result.filePaths[0];
                },
                pickIdm: async () => {
                    const result = await dialog.showOpenDialog(window, {
                        properties: ['openFile'],
                        filters: [{name: 'IDM executable (IDMan.exe)', extensions: ['exe']}]
                    });
                    return result.canceled ? null : result.filePaths[0];
                },
                openDirectory: async directory => {
                    await fs.mkdir(directory, {recursive: true});
                    const error = await shell.openPath(directory);
                    if (error) throw new AppError('FOLDER_OPEN', 'The download folder could not be opened.', {status: 500});
                }, checkUpdates,
            },
        });
        application.queue.on('state', state => window?.setProgressBar(state.running && state.summary.runTotal ? state.summary.runFinished / state.summary.runTotal : -1));
        origin = await application.listen();
        await createWindow();
    }).catch(error => {
        report(error, 'Startup');
        dialog.showErrorBox('White Dreams · Startup error', asAppError(error).message + '\n\nCheck disk access and installed dependencies, then reopen the app.');
        void shutdown(1);
    });
    app.on('activate', () => {
        if (origin && !window && !quitting) createWindow().catch(e => report(e, 'Window'));
    });
    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') void shutdown();
    });
    app.on('before-quit', event => {
        if (!quitting) {
            event.preventDefault();
            void shutdown();
        }
    });
}
