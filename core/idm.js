/** නමෝ බුද්ධාය | 🤍 */

import fs from 'node:fs';
import path from 'node:path';
import {execFile, execFileSync, spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {AppError, checkAbort} from './errors.js';

const execFileAsync = promisify(execFile);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const DEFAULT_MAX_WAIT_MS = 6 * 60 * 60 * 1000; // 6h
const KILL_SETTLE_MS      = 500;                 // let Windows release handles

let cachedDetection;
let detectionTime = 0;

export function detectIDM() {
    if (process.platform !== 'win32') return '';
    if (cachedDetection && fs.existsSync(cachedDetection)) return cachedDetection;
    if (cachedDetection === '' && Date.now() - detectionTime < 60000) return '';
    detectionTime = Date.now();
    const candidates = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles]
        .filter(Boolean).map(dir => path.join(dir, 'Internet Download Manager', 'IDMan.exe'));
    for (const key of ['HKLM\\SOFTWARE\\Wow6432Node\\Internet Download Manager', 'HKCU\\SOFTWARE\\DownloadManager']) {
        try {
            const output = execFileSync('reg.exe', ['query', key, '/v', 'ExePath'], {
                encoding: 'utf8', windowsHide: true, timeout: 2000,
                stdio: ['ignore', 'pipe', 'ignore']
            });
            const found = output.match(/REG_SZ\s+(.+)/);
            if (found) candidates.push(found[1].trim());
        } catch { /* Registry entry is optional. */ }
    }
    return (cachedDetection = candidates.find(p => fs.existsSync(p)) || '');
}

/**
 * Kill every running IDM process (main + browser helpers).
 * Safe to call when nothing is running — taskkill exits non-zero, we swallow it.
 */
async function killAllIDMProcesses(log) {
    for (const image of ['IDMan.exe', 'IEMonitor.exe', 'IDMIntegrator.exe']) {
        try {
            await execFileAsync('taskkill', ['/F', '/IM', image], {
                windowsHide: true, timeout: 5000
            });
        } catch (err) {
            // 128 = "process not found" — expected when nothing is running.
            const code = err.code;
            if (code !== 128 && code !== 1) {
                log?.add?.('warn', `Could not stop ${image}: ${err.message}`, 'IDM');
            }
        }
    }
}

/**
 * Wait for the spawned IDM process to exit, honouring abort + timeout.
 * Returns {code, signal} — but do NOT trust code alone (IDM doesn't
 * document exit codes), always verify the file after.
 */
function waitForIDMExit(child, {signal, maxMs = DEFAULT_MAX_WAIT_MS} = {}) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const done = (err, val) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
            err ? reject(err) : resolve(val);
        };

        const timer = setTimeout(() => {
            try { child.kill(); } catch { /* already gone */ }
            done(new AppError(
                'IDM_TIMEOUT',
                'IDM did not report completion within the allowed window.',
                {status: 504}
            ));
        }, maxMs);
        timer.unref?.();

        const onAbort = () => {
            try { child.kill(); } catch { /* already gone */ }
            done(new AppError('ABORTED', 'Cancelled by user.', {status: 499}));
        };

        if (signal) {
            if (signal.aborted) return onAbort();
            signal.addEventListener('abort', onAbort, {once: true});
        }

        child.once('error', err => done(new AppError(
            'IDM_LAUNCH',
            `IDM could not be launched: ${err.message}`,
            {status: 503}
        )));
        child.once('exit', (code, sig) => done(null, {code, signal: sig}));
    });
}

async function verifyFinalFile(downloadDir, outputName, {signal} = {}) {
    checkAbort(signal);
    const filePath = path.join(downloadDir, outputName);
    const stat = await fs.promises.stat(filePath).catch(() => null);
    if (!stat || !stat.isFile()) {
        throw new AppError(
            'IDM_FILE_MISSING',
            `IDM exited but "${outputName}" was not found. It may have been cancelled inside IDM.`,
            {status: 502}
        );
    }
    return {path: filePath, size: stat.size};
}

export async function sendToIDM(url, file, settings, signal, log) {
    checkAbort(signal);
    if (process.platform !== 'win32') {
        throw new AppError(
            'IDM_PLATFORM',
            'IDM hand-off requires Windows. Choose the built-in engine.',
            {status: 503}
        );
    }

    const executable = settings.idmPath || detectIDM();
    if (!executable || !fs.existsSync(executable)) {
        throw new AppError(
            'IDM_MISSING',
            'IDMan.exe was not found. Set its path in Settings.',
            {status: 503}
        );
    }

    await fs.promises.mkdir(settings.downloadDir, {recursive: true});

    const takeover = Boolean(settings.idmTakeover);
    const outputName = file.name.replace(/(\.[^.]+)?$/, `-${file.id.slice(0, 8)}$1`);

    // ── 1. Takeover mode: stop every IDM instance first ────────────────
    if (takeover) {
        log?.add?.('info', 'Stopping any running IDM instance…', 'IDM');
        await killAllIDMProcesses(log);
        await sleep(KILL_SETTLE_MS);
        checkAbort(signal);
    }

    // ── 2. Spawn IDM ───────────────────────────────────────────────────
    const args = ['/d', url, '/p', settings.downloadDir, '/f', outputName, '/n'];
    if (takeover) args.push('/q'); // exit after completion

    const child = spawn(executable, args, {
        shell: false,
        windowsHide: true,   // takeover = no dialogs; also hides IDM's window
        // Do NOT detach when we need to observe exit.
        detached: !takeover,
        stdio: 'ignore'
    });

    // ── 3a. Non-takeover: hand off and return immediately (old behaviour) ──
    if (!takeover) {
        await new Promise((resolve, reject) => {
            child.once('error', () => reject(new AppError(
                'IDM_LAUNCH',
                'IDM could not be launched. Check its installation and path.',
                {status: 503}
            )));
            child.once('spawn', () => { child.unref(); resolve(); });
        });
        return {
            status: 'handed-off',
            outputName,
            bytes: 0,
            totalBytes: null,
            speed: 0
        };
    }

    // ── 3b. Takeover: wait for IDM to exit, then verify the file ───────
    const maxMs = settings.idmMaxWaitMs ?? DEFAULT_MAX_WAIT_MS;
    await waitForIDMExit(child, {signal, maxMs});
    const {size} = await verifyFinalFile(settings.downloadDir, outputName, {signal});

    return {
        status: 'completed',
        outputName,
        bytes: size,
        totalBytes: size,
        speed: 0
    };
}