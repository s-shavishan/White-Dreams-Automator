/** නමෝ බුද්ධාය | 🤍 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createApplication} from '../server.js';
import {fixture, links, eventually} from './helpers.js';
import {delay} from '../core/errors.js';

async function setup(t, overrides = {}) {
    const f = fixture(t, overrides), app = createApplication(f), origin = await app.listen();
    t.after(() => app.close());
    const first = await fetch(origin + '/api/bootstrap'), data = await first.json();
    const cookie = first.headers.get('set-cookie').split(';')[0];
    const headers = {cookie, 'Content-Type': 'application/json', 'X-WD-Token': data.token};
    const request = async (route, body) => {
        const response = await fetch(origin + route, {
            method: body === undefined ? 'GET' : 'POST',
            headers,
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        return {status: response.status, data: await response.json()};
    };
    return {...f, app, origin, headers, request};
}

test('loopback API requires a session and same-origin mutation token', async t => {
    const f = await setup(t);
    assert.equal(f.app.server.address().address, '127.0.0.1');
    assert.equal((await fetch(f.origin + '/api/state')).status, 401);
    assert.equal((await fetch(f.origin + '/api/import', {
        method: 'POST',
        headers: {...f.headers, 'X-WD-Token': 'bad'},
        body: '{}'
    })).status, 403);
    assert.equal((await fetch(f.origin + '/api/bootstrap', {headers: {Origin: 'https://attacker.example'}})).status, 403);
    const status = await new Promise((resolve, reject) => {
        http.get(f.origin + '/api/state', {headers: {...f.headers, Host: 'attacker.example'}}, response => {
            response.resume();
            resolve(response.statusCode);
        }).on('error', reject);
    });
    assert.equal(status, 403);
});
test('static routes cannot read source or traverse outside public assets', async t => {
    const f = await setup(t);
    for (const route of ['/server.js', '/env.js', '/%2e%2e%2fpackage.json', '/package.json']) assert.notEqual((await fetch(f.origin + route, {headers: f.headers})).status, 200);
    const response = await fetch(f.origin);
    assert.ok(response.headers.get('content-security-policy').includes("script-src 'self'"));
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});
test('malformed/oversize JSON returns structured 400/413 without crashing', async t => {
    const f = await setup(t);
    assert.equal((await fetch(f.origin + '/api/import', {
        method: 'POST',
        headers: f.headers,
        body: '{bad'
    })).status, 400);
    assert.equal((await fetch(f.origin + '/api/import', {
        method: 'POST',
        headers: f.headers,
        body: JSON.stringify({text: 'a'.repeat(1024 * 1024 + 1)})
    })).status, 413);
    assert.equal((await f.request('/api/state')).status, 200);
});
test('import, duplicate detection, start, completion, and clear remain synchronized', async t => {
    const f = await setup(t);
    const imported = await f.request('/api/import', {files: links(3)});
    assert.equal(imported.data.added, 3);
    assert.equal((await f.request('/api/import', {files: links(3)})).data.duplicates, 3);
    const started = await f.request('/api/start', {ids: imported.data.ids});
    assert.equal(started.status, 200);
    await f.app.queue.task;
    assert.equal((await f.request('/api/state')).data.summary.completed, 3);
    assert.equal((await f.request('/api/clear', {})).data.state.files.length, 0);
});
test('settings reject mutation while running and Stop always remains available', async t => {
    const f = await setup(t, {
        download: async (url, file, settings, signal) => {
            await delay(10000, signal);
            return {status: 'completed'};
        }
    });
    const imported = await f.request('/api/import', {files: links(1)});
    await f.request('/api/start', {ids: imported.data.ids});
    assert.equal((await f.request('/api/config', {retries: 1})).status, 409);
    assert.equal((await f.request('/api/start', {ids: imported.data.ids})).status, 409);
    assert.equal((await f.request('/api/stop', {})).status, 200);
    await f.app.queue.task;
    assert.equal(f.app.queue.running, false);
});
test('extraction is serialized and cancellable without an orphan queue', async t => {
    const resolver = {
        extract: async (url, signal) => {
            await delay(10000, signal);
            return links(1);
        }, close: async () => {
        }, resolve: async url => url
    };
    const f = await setup(t, {resolver});
    f.config.update({license: 'test-license'});
    const extraction = f.request('/api/extract', {url: 'https://example.com/list'});
    await eventually(() => f.app.publicState().extracting);
    assert.equal((await f.request('/api/extract', {url: 'https://example.com/list2'})).status, 409);
    await f.request('/api/extract/cancel', {});
    assert.equal((await extraction).data.code, 'CANCELLED');
    assert.equal(f.app.publicState().extracting, false);
});
test('SSE initial snapshot is complete and disconnect cleans up on close', async t => {
    const f = await setup(t);
    const controller = new AbortController();
    const response = await fetch(f.origin + '/api/events', {headers: f.headers, signal: controller.signal});
    assert.match(response.headers.get('content-type'), /text\/event-stream/);
    const reader = response.body.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    assert.ok(first.includes('event: state'));
    assert.ok(first.includes('"files":[]'));
    controller.abort();
    await reader.cancel().catch(() => {
    });
});
test('diagnostics exclude license keys and queue URLs', async t => {
    const f = await setup(t);
    f.config.update({license: 'secret-test-license'});
    await f.request('/api/import', {files: [{name: 'file.zip', url: 'https://example.com/file?token=private'}]});
    f.app.log.add('info', 'GET https://example.com/file?token=private');
    const output = JSON.stringify((await f.request('/api/diagnostics')).data);
    assert.ok(!output.includes('secret-test-license'));
    assert.ok(!output.includes('token=private'));
    assert.ok(!output.includes(f.directory));
});
