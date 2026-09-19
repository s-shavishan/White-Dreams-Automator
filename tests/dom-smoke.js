/** නමෝ බුද්ධාය | 🤍 */
/** DOM integration tests. They exercise real HTTP/SSE, but do not validate CSS rendering or native dialogs. */

import {JSDOM, VirtualConsole} from 'jsdom';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApplication} from '../server.js';
import {AppError, delay} from '../core/errors.js';
import {eventually, codec} from './helpers.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-v3-dom-'));
let calls = 0;
const app = createApplication({
    directory, codec, resolver: {
        close: async () => {
        }, resolve: async url => url, extract: async () => []
    },
    download: async (url, file, settings, signal, progress) => {
        calls++;
        if (file.name.includes('fail')) throw new AppError('FIXTURE_ERROR', 'A simulated failure.');
        await delay(60, signal);
        progress({bytes: 512, totalBytes: 1024, speed: 1024});
        await delay(60, signal);
        return {status: 'completed', bytes: 1024, totalBytes: 1024, outputName: file.name, checksum: 'a'.repeat(64)};
    }
});
app.config.update({downloadDir: path.join(directory, 'downloads'), retries: 0});
const origin = await app.listen();
const errors = [], downloads = [], doms = [];
let cookie = '';

async function dom() {
    const console = new VirtualConsole();
    console.on('jsdomError', e => errors.push(e.message));
    const document = new JSDOM(fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8'), {
        url: origin,
        runScripts: 'outside-only',
        pretendToBeVisual: true,
        virtualConsole: console
    });
    doms.push(document);
    const w = document.window;
    w.matchMedia = () => ({
        matches: false, addEventListener() {
        }, removeEventListener() {
        }
    });
    w.scrollTo = () => {
    };
    w.AbortController = globalThis.AbortController;
    w.HTMLDialogElement.prototype.showModal = function () {
        this.open = true;
    };
    w.HTMLDialogElement.prototype.close = function (result = '') {
        this.open = false;
        this.returnValue = result;
        this.dispatchEvent(new w.Event('close'));
    };
    w.HTMLAnchorElement.prototype.click = function () {
        downloads.push(this.download);
    };
    w.URL.createObjectURL = () => 'blob:fixture';
    w.URL.revokeObjectURL = () => {
    };
    w.fetch = async (route, options = {}) => {
        const response = await fetch(new URL(route, origin), {
            ...options,
            headers: {...options.headers, ...(cookie ? {cookie} : {})}
        });
        if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
        return response;
    };
    const sources = new Set();
    w.EventSource = class extends w.EventTarget {
        constructor(route) {
            super();
            this.controller = new AbortController();
            sources.add(this);
            void (async () => {
                const response = await w.fetch(route, {signal: this.controller.signal});
                if (!response.ok) throw new Error('SSE fixture could not connect');
                this.onopen?.();
                const reader = response.body.getReader(), decoder = new TextDecoder();
                let buffer = '';
                while (true) {
                    const next = await reader.read();
                    if (next.done) break;
                    buffer += decoder.decode(next.value, {stream: true});
                    let end;
                    while ((end = buffer.indexOf('\n\n')) >= 0) {
                        const message = buffer.slice(0, end);
                        buffer = buffer.slice(end + 2);
                        const event = message.match(/^event: (.+)$/m)?.[1];
                        const data = message.match(/^data: (.+)$/m)?.[1];
                        if (event && data) this.dispatchEvent(new w.MessageEvent(event, {data}));
                    }
                }
            })().catch(() => {
                if (!this.controller.signal.aborted) this.onerror?.();
            });
        }

        close() {
            this.controller.abort();
            sources.delete(this);
        }
    };
    const close = document.window.close.bind(document.window);
    document.window.close = () => {
        for (const s of sources) s.close();
        close();
    };
    w.eval(fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8'));
    await eventually(() => w.document.getElementById('connection').textContent.includes('Live connection'));
    return w;
}

try {
    let w = await dom();
    const get = id => w.document.getElementById(id);
    const submit = id => get(id).dispatchEvent(new w.Event('submit', {bubbles: true, cancelable: true}));
    assert.equal(get('startBtn').disabled, true);
    get('importBtn').click();
    get('importText').value = ['https://example.com/one.zip', 'https://example.com/two.zip', 'https://example.com/fail.zip'].join('\n');
    submit('importForm');
    await eventually(() => get('statTotal').textContent === '3');
    assert.equal(get('fileRows').children.length, 3);
    assert.match(get('selInfo').textContent, /3 selected/);
    get('startBtn').click();
    await eventually(() => app.queue.running && !get('pauseBtn').disabled);
    get('pauseBtn').click();
    await eventually(() => app.queue.phase === 'paused');
    assert.equal(calls, 1);
    await eventually(() => get('pauseBtn').textContent === 'Resume queue' && !get('pauseBtn').disabled);
    get('pauseBtn').click();
    await eventually(() => !app.queue.running);
    await eventually(() => get('statDone').textContent === '2');
    assert.equal(get('statAttention').textContent, '1');
    get('filterTabs').querySelector('[data-filter="attention"]').click();
    await eventually(() => get('fileRows').children.length === 1);
    get('fileRows').querySelector('[data-detail-id]').click();
    assert.ok(get('detailBody').textContent.includes('FIXTURE_ERROR'));
    get('detailDialog').close();
    get('filterTabs').querySelector('[data-filter="all"]').click();
    get('search').value = 'two.zip';
    get('search').dispatchEvent(new w.Event('input'));
    await eventually(() => get('fileRows').children.length === 1 && get('fileRows').textContent.includes('two.zip'));
    get('search').value = '';
    get('search').dispatchEvent(new w.Event('input'));
    get('settingsBtn').click();
    get('themeInput').value = 'dark';
    get('retriesInput').value = '1';
    submit('settingsForm');
    await eventually(() => !get('settingsDialog').open);
    assert.equal(w.document.documentElement.dataset.theme, 'dark');
    assert.equal(app.config.settings.retries, 1);
    get('exportBtn').click();
    assert.ok(downloads.includes('White-Dreams-queue.json'));
    // A renderer reload must restore server-owned state and not restart transfers.
    const previousCalls = calls;
    w.close();
    w = await dom();
    await eventually(() => get('statDone').textContent === '2');
    assert.equal(calls, previousCalls);
    const many = Array.from({length: 125}, (_, i) => ({
        name: i ? `resource-${i}.zip` : '<img onerror="window.injected=1">.zip',
        url: `https://example.com/resource/${i}`,
        kind: 'direct'
    }));
    app.queue.add(many);
    await eventually(() => get('statTotal').textContent === '128');
    assert.equal(get('fileRows').children.length, 50);
    assert.equal(w.injected, undefined);
    get('nextPage').click();
    await eventually(() => get('pageNumber').textContent === '2 / 3');
    assert.equal(get('fileRows').children.length, 50);
    get('search').value = 'resource-12';
    get('search').dispatchEvent(new w.Event('input'));
    await eventually(() => get('fileRows').children.length === 6);
    get('selectVisible').checked = true;
    get('selectVisible').dispatchEvent(new w.Event('change'));
    await eventually(() => get('selInfo').textContent === '6 selected');
    get('search').value = '';
    get('search').dispatchEvent(new w.Event('input'));
    await eventually(() => !get('removeBtn').disabled);
    get('removeBtn').click();
    await eventually(() => get('confirmDialog').open);
    get('confirmAccept').click();
    await eventually(() => get('statTotal').textContent === '122');
    get('importBtn').click();
    get('importText').value = 'file:///secret';
    submit('importForm');
    await eventually(() => !get('importError').classList.contains('hidden'));
    assert.equal(app.queue.files.length, 122);
    get('importDialog').close();
    get('navActivity').click();
    assert.ok(get('fullLog').children.length > 0);
    get('diagnosticsBtn').click();
    await eventually(() => downloads.includes('White-Dreams-diagnostics.json'));
    get('activityDialog').close();
    w.dispatchEvent(new w.Event('offline'));
    assert.equal(get('startBtn').disabled, true);
    assert.equal(get('importBtn').disabled, true);
    w.dispatchEvent(new w.Event('online'));
    await eventually(() => get('connection').textContent.includes('Live connection'));
    // Hostile names bypassing normalization still cannot become executable markup in the renderer.
    app.queue.files[0].name = '<img src=x onerror="window.injected=1">';
    app.queue.publish();
    await eventually(() => get('fileRows').textContent.includes('<img src=x'));
    assert.equal(get('fileRows').querySelectorAll('img').length, 0);
    assert.equal(w.injected, undefined);
    assert.deepEqual(errors, []);
    console.log('DOM integration passed: import, selection, start, pause/resume, failure state, inspector, search, filters, settings, theme, export, recovery, 128-file pagination, removal, invalid import, diagnostics, reconnect, and safe text rendering.');
    console.log('CSS layout, native browser behavior and Electron dialogs were not tested by this suite.');
} finally {
    for (const d of doms) d.window.close();
    await app.close();
    fs.rmSync(directory, {recursive: true, force: true});
}
