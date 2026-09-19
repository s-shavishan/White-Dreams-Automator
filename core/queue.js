/** නමෝ බුද්ධාය | 🤍 */

import {EventEmitter} from 'node:events';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {JsonStore} from './storage.js';
import {normalizeFiles, MAX_FILES, publicUrl, safeName} from './validation.js';
import {AppError, asAppError, errorData, checkAbort, delay} from './errors.js';
import {downloadFile} from './download.js';
import {sendToIDM} from './idm.js';

const ACTIVE = new Set(['resolving', 'downloading', 'handing-off', 'retrying']);
const TERMINAL = new Set(['completed', 'handed-off', 'failed', 'cancelled', 'interrupted']);
const STATUSES = new Set(['queued', ...ACTIVE, ...TERMINAL]);
const IDM_RETRY_SAFE = new Set(['IDM_MISSING', 'IDM_LAUNCH', 'IDM_TIMEOUT', 'IDM_FILE_MISSING']);

export class DownloadQueue extends EventEmitter {
    constructor({config, log, resolver, download = downloadFile, handoff = sendToIDM, store}) {
        super();
        Object.assign(this, {config, log, resolver, download, handoff});
        this.store = store || new JsonStore(path.join(config.directory, 'queue-v3.json'));
        this.files = [];
        this.running = false;
        this.paused = false;
        this.phase = 'idle';
        this.revision = 0;
        this.runIds = [];
        this.persistenceError = null;
        this.task = null;
        const saved = this.store.read({
            version: 3,
            files: []
        }, s => s?.version === 3 && Array.isArray(s.files) && s.files.length <= MAX_FILES && s.files.every(f =>
            f && typeof f.id === 'string' && /^[0-9a-f-]{36}$/.test(f.id) && typeof f.url === 'string' && STATUSES.has(f.status)));
        const ids = new Set(), urls = new Set();
        for (const f of saved.files) {
            try {
                const normalized = normalizeFiles([f])[0];
                if (ids.has(f.id) || urls.has(normalized.url)) continue;
                ids.add(f.id);
                urls.add(normalized.url);
                const interrupted = ACTIVE.has(f.status);
                this.files.push({
                    ...this.newFile(normalized), id: f.id, status: interrupted ? 'interrupted' : f.status,
                    bytes: Number.isSafeInteger(f.bytes) && f.bytes >= 0 ? f.bytes : 0,
                    totalBytes: Number.isSafeInteger(f.totalBytes) && f.totalBytes >= 0 ? f.totalBytes : null,
                    outputName: f.outputName ? safeName(f.outputName) : null,
                    attempts: Number.isInteger(f.attempts) ? f.attempts : 0,
                    checksum: /^[a-f0-9]{64}$/.test(f.checksum || '') ? f.checksum : null,
                    error: interrupted ? {
                            code: 'INTERRUPTED',
                            message: 'Interrupted by app exit. Retry restarts this file; an IDM transfer may still be running.',
                            retryable: false
                        } :
                        f.error && typeof f.error.message === 'string' ? {
                            code: String(f.error.code || 'UNEXPECTED').slice(0, 40),
                            message: f.error.message.slice(0, 300),
                            retryable: Boolean(f.error.retryable)
                        } : null,
                });
            } catch {
                log.add('warn', 'An invalid saved queue entry was skipped.');
            }
        }
        if (this.store.warning) log.add('warn', this.store.warning, 'RECOVERY');
        if (this.files.length) log.add('info', `Restored ${this.files.length} queue entries. Nothing starts automatically.`);
    }

    newFile(f) {
        return {
            ...f, id: randomUUID(), status: 'queued', bytes: 0, totalBytes: null, speed: 0, elapsed: 0,
            attempts: 0, error: null, outputName: null, checksum: null
        };
    }

    summary() {
        const s = {
            total: this.files.length,
            completed: 0,
            failed: 0,
            cancelled: 0,
            interrupted: 0,
            handedOff: 0,
            queued: 0,
            active: 0,
            bytes: 0,
            speed: 0
        };
        for (const f of this.files) {
            if (f.status === 'handed-off') s.handedOff++;
            else if (ACTIVE.has(f.status)) {
                s.active++;
                s.speed += f.speed || 0;
            } else if (Object.hasOwn(s, f.status)) s[f.status]++;
            s.bytes += f.bytes || 0;
        }
        const runFiles = this.files.filter(f => this.runIds.includes(f.id));
        s.runTotal = runFiles.length;
        s.runFinished = runFiles.filter(f => TERMINAL.has(f.status)).length;
        return s;
    }

    public() {
        return {
            version: '3.0.0', revision: this.revision, running: this.running, paused: this.paused, phase: this.phase,
            summary: this.summary(), files: this.files.map(f => ({...f})), persistenceError: this.persistenceError
        };
    }

    save() {
        this.store.write({version: 3, files: this.files.map(f => ({...f, speed: 0}))});
    }

    publish(file) {
        this.revision++;
        if (file) this.emit('patch', {
            revision: this.revision,
            file: {...file},
            summary: this.summary(),
            phase: this.phase
        });
        else this.emit('state', this.public());
    }

    assertIdle() {
        if (this.running) throw new AppError('QUEUE_BUSY', 'Stop the current queue before changing its files or settings.', {status: 409});
    }

    add(raw, kind = 'direct') {
        this.assertIdle();
        const normalized = normalizeFiles(raw, kind);
        const seen = new Set(this.files.map(f => f.url));
        const added = normalized.filter(f => !seen.has(f.url)).map(f => this.newFile(f));
        if (this.files.length + added.length > MAX_FILES) throw new AppError('QUEUE_LIMIT', `The queue supports up to ${MAX_FILES} files. Remove old entries first.`);
        const previous = this.files;
        this.files = [...previous, ...added];
        try {
            this.save();
        } catch (error) {
            this.files = previous;
            throw error;
        }
        this.publish();
        this.log.add('info', `Added ${added.length} files; ${raw.length - added.length} duplicates skipped.`);
        return {added: added.length, duplicates: raw.length - added.length, ids: added.map(f => f.id)};
    }

    remove(ids) {
        this.assertIdle();
        if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) throw new AppError('INVALID_IDS', 'Select valid queue entries.');
        const previous = this.files;
        this.files = previous.filter(f => !ids.includes(f.id));
        try {
            this.save();
        } catch (e) {
            this.files = previous;
            throw e;
        }
        this.runIds = this.runIds.filter(id => this.files.some(f => f.id === id));
        this.publish();
        return previous.length - this.files.length;
    }

    clear() {
        return this.remove(this.files.map(f => f.id));
    }

    start(ids) {
        this.assertIdle();
        if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string' || !this.files.some(f => f.id === id))) throw new AppError('INVALID_IDS', 'Select at least one valid queue entry.');
        const pending = this.files.filter(f => ids.includes(f.id) && !['completed', 'handed-off'].includes(f.status));
        if (!pending.length) throw new AppError('NOTHING_TO_RUN', 'These files are already completed or handed to IDM.');
        if (pending.some(f => f.kind === 'page') && !this.config.getLicense()) throw new AppError('LICENSE_REQUIRED', 'Add your CloakBrowser license in Settings to resolve file-page links. Direct file URLs do not need it.');
        const settings = {...this.config.settings};
        if (settings.engine === 'idm' && process.platform !== 'win32') throw new AppError('IDM_PLATFORM', 'IDM requires Windows. Choose the built-in engine.');
        const previous = this.files.map(f => ({...f}));
        for (const f of pending) Object.assign(f, {
            status: 'queued',
            error: null,
            attempts: 0,
            bytes: 0,
            totalBytes: null,
            speed: 0,
            outputName: null,
            checksum: null
        });
        try {
            this.save();
        } catch (e) {
            this.files = previous;
            throw e;
        }
        this.controller = new AbortController();
        this.running = true;
        this.paused = false;
        this.phase = 'running';
        this.persistenceError = null;
        this.runIds = pending.map(f => f.id);
        this.publish();
        this.log.add('info', `Started ${pending.length} files with the ${settings.engine === 'native' ? 'built-in' : 'IDM'} engine.`);
        this.task = this.run(pending, settings).catch(e => this.log.error(e, 'Queue cleanup'));
        return pending.length;
    }

    update(file, patch, persist = true) {
        Object.assign(file, patch);
        if (persist) this.save();
        this.publish(file);
    }

    async run(pending, settings) {
        const signal = this.controller.signal;
        try {
            for (const file of pending) {
                while (this.paused && !signal.aborted) {
                    if (this.phase !== 'paused') {
                        this.phase = 'paused';
                        this.publish();
                    }
                    await delay(100, signal);
                }
                checkAbort(signal);
                this.phase = 'running';
                for (let attempt = 0; attempt <= settings.retries; attempt++) {
                    try {
                        checkAbort(signal);
                        this.update(file, {
                            status: file.kind === 'page' ? 'resolving' : 'downloading',
                            attempts: attempt + 1,
                            error: null,
                            bytes: 0,
                            speed: 0
                        });
                        const url = file.kind === 'page'
                            ? await this.resolver.resolve(file.url, signal)
                            : publicUrl(file.url);
                        checkAbort(signal);
                        this.update(file, {status: settings.engine === 'idm' ? 'handing-off' : 'downloading'});
                        const result = settings.engine === 'idm'
                            ? await this.handoff(url, file, settings, signal, this.log)
                            : await this.download(url, file, settings, signal, patch => this.update(file, patch, false));

                        // Preserve a successful external hand-off even if Stop arrived during spawn.
                        this.update(file, {...result, error: null, speed: 0});
                        this.log.add('info', `${file.name}: ${result.status === 'completed' ? 'completed' : 'sent to IDM (completion unverified)'}.`);
                        break;
                    } catch (error) {
                        const e = asAppError(error);
                        if (e.code === 'STORAGE') throw e;
                        if (signal.aborted || e.code === 'CANCELLED') {
                            this.update(file, {status: 'cancelled', error: null, speed: 0});
                            throw new AppError('CANCELLED', 'Queue stopped.', {status: 409});
                        }

                        /* A non-takeover IDM hand-off whose outcome we cannot
                        determine must never be retried: IDM may already be
                         downloading the URL, and a retry would duplicate it.
                        Takeover-mode failures in IDM_RETRY_SAFE are proven
                         not to have produced a file, so they are safe.*/
                        const uncertainHandoff =
                            settings.engine === 'idm' &&
                            file.status === 'handing-off' &&
                            !IDM_RETRY_SAFE.has(e.code);

                        if (e.retryable && !uncertainHandoff && attempt < settings.retries) {
                            this.update(file, {status: 'retrying', error: errorData(e), speed: 0});
                            this.log.add('warn', `${file.name}: retry ${attempt + 1}/${settings.retries}.`, e.code);
                            await delay(Math.min(30000, settings.retryDelayMs * 2 ** attempt), signal);
                        } else {
                            this.update(file, {status: 'failed', error: errorData(e), speed: 0});
                            this.log.error(e, file.name);
                            break;
                        }
                    }
                }
            }
        } catch (e) {
            if (asAppError(e).code === 'STORAGE') {
                this.persistenceError = asAppError(e).message;
                this.controller.abort();
                this.log.error(e);
            } else if (asAppError(e).code !== 'CANCELLED') this.log.error(e, 'Queue');
        } finally {
            for (const file of pending) {
                if (!TERMINAL.has(file.status)) Object.assign(file, {
                    status: this.persistenceError ? 'interrupted' : 'cancelled',
                    speed: 0
                });
            }
            try {
                await this.resolver.close();
            } catch (e) {
                this.log.error(e, 'Browser cleanup');
            }
            this.running = false;
            this.paused = false;
            this.phase = 'idle';
            try {
                this.save();
            } catch (e) {
                this.persistenceError = asAppError(e).message;
                this.log.error(e);
            }
            this.publish();
            this.log.add(this.persistenceError ? 'error' : 'info', 'Queue finished. Review file statuses for the outcome.');
            this.emit('finished', this.summary());
        }
    }

    pause() {
        if (!this.running || this.phase === 'stopping') throw new AppError('NOT_RUNNING', 'No queue is available to pause.', {status: 409});
        this.paused = true;
        this.publish();
        this.log.add('info', 'Pause requested. The active file continues; the next file waits.');
    }

    resume() {
        if (!this.running || this.phase === 'stopping') throw new AppError('NOT_RUNNING', 'No paused queue is available.', {status: 409});
        this.paused = false;
        this.phase = 'running';
        this.publish();
    }

    stop() {
        if (!this.running) return;
        this.phase = 'stopping';
        this.paused = false;
        this.controller.abort();
        this.publish();
        this.log.add('warn', 'Stopping the queue. Transfers already sent to IDM must be stopped in IDM.');
    }

    async shutdown() {
        this.stop();
        await this.task;
        await this.resolver.close();
    }
}
