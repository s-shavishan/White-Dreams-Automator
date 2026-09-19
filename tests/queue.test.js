/** නමෝ බුද්ධාය | 🤍 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {DownloadQueue} from '../core/queue.js';
import {AppError, delay} from '../core/errors.js';
import {fixture, links, eventually} from './helpers.js';

test('stable IDs survive add/dedupe, selected subsets, and restart', async t => {
    const f = fixture(t), q = f.queue;
    q.add(links(4));
    const ids = q.files.map(f => f.id);
    assert.equal(q.add(links(4)).duplicates, 4);
    q.start([ids[1], ids[3]]);
    await q.task;
    assert.deepEqual(q.files.map(f => f.id), ids);
    assert.equal(q.summary().completed, 2);
    assert.equal(q.summary().queued, 2);
    const restored = new DownloadQueue(f);
    assert.equal(restored.running, false);
    assert.deepEqual(restored.files.map(f => f.id), ids);
});
test('failures count correctly and the queue always returns idle', async t => {
    const {queue} = fixture(t, {
        download: async () => {
            throw new AppError('TEST_ERROR', 'Expected fixture failure.');
        }
    });
    const {ids} = queue.add(links(3));
    queue.start(ids);
    await queue.task;
    assert.equal(queue.summary().failed, 3);
    assert.equal(queue.summary().completed, 0);
    assert.equal(queue.running, false);
});
test('transient errors use bounded retries and succeed on a later attempt', async t => {
    let calls = 0;
    const f = fixture(t, {
        download: async () => {
            if (++calls < 3) throw new AppError('NETWORK', 'Retry fixture', {retryable: true});
            return {status: 'completed', bytes: 1};
        }
    });
    f.config.update({retries: 2, retryDelayMs: 500});
    const {ids} = f.queue.add(links(1));
    f.queue.start(ids);
    await f.queue.task;
    assert.equal(calls, 3);
    assert.equal(f.queue.files[0].attempts, 3);
    assert.equal(f.queue.files[0].status, 'completed');
});
test('Stop aborts the active transfer, cancels pending files, and preserves unselected ones', async t => {
    const {queue} = fixture(t, {
        download: async (url, file, settings, signal) => {
            await delay(10000, signal);
            return {status: 'completed'};
        }
    });
    const {ids} = queue.add(links(3));
    queue.start(ids.slice(0, 2));
    await eventually(() => queue.files[0].status === 'downloading');
    queue.stop();
    await queue.task;
    assert.equal(queue.summary().cancelled, 2);
    assert.equal(queue.files[2].status, 'queued');
    assert.equal(queue.running, false);
});
test('pause waits between files and resume continues', async t => {
    let release, began = 0;
    const first = new Promise(resolve => {
        release = resolve;
    });
    const {queue} = fixture(t, {
        download: async () => {
            if (++began === 1) await first;
            return {status: 'completed', bytes: 1};
        }
    });
    const {ids} = queue.add(links(2));
    queue.start(ids);
    await eventually(() => began === 1);
    queue.pause();
    release();
    await eventually(() => queue.phase === 'paused');
    assert.equal(began, 1);
    queue.resume();
    await queue.task;
    assert.equal(began, 2);
    assert.equal(queue.summary().completed, 2);
});
test('Stop while paused exits promptly', async t => {
    const {queue} = fixture(t, {
        download: async () => {
            await delay(30);
            return {status: 'completed', bytes: 1};
        }
    });
    const {ids} = queue.add(links(2));
    queue.start(ids);
    queue.pause();
    await eventually(() => queue.phase === 'paused');
    queue.stop();
    await queue.task;
    assert.equal(queue.running, false);
    assert.equal(queue.summary().cancelled, 1);
});
test('concurrent start and mutations are rejected while running', async t => {
    const {queue} = fixture(t, {
        download: async (url, file, settings, signal) => {
            await delay(10000, signal);
            return {status: 'completed'};
        }
    });
    const {ids} = queue.add(links(2));
    queue.start(ids);
    assert.throws(() => queue.start(ids), {code: 'QUEUE_BUSY'});
    assert.throws(() => queue.clear(), {code: 'QUEUE_BUSY'});
    queue.stop();
    await queue.task;
});
test('interrupted saved activity never resumes by itself', t => {
    const f = fixture(t);
    f.queue.add(links(1));
    f.queue.files[0].status = 'downloading';
    f.queue.save();
    const q = new DownloadQueue(f);
    assert.equal(q.running, false);
    assert.equal(q.files[0].status, 'interrupted');
    assert.equal(q.summary().interrupted, 1);
});
test('IDM-style hand-off is never counted as completed', async t => {
    const f = fixture(t, {download: async () => ({status: 'handed-off', bytes: 0})});
    const {ids} = f.queue.add(links(1));
    f.queue.start(ids);
    await f.queue.task;
    assert.equal(f.queue.summary().completed, 0);
    assert.equal(f.queue.summary().handedOff, 1);
});
test('persistent storage failure rolls back collection mutations', t => {
    const {queue} = fixture(t);
    queue.add(links(1));
    queue.store.write = () => {
        throw new AppError('STORAGE', 'Disk full', {status: 507});
    };
    assert.throws(() => queue.add(links(2)), {code: 'STORAGE'});
    assert.equal(queue.files.length, 1);
    assert.throws(() => queue.clear(), {code: 'STORAGE'});
    assert.equal(queue.files.length, 1);
});
test('storage failure during a run is visible and cannot leave running stuck', async t => {
    const {queue} = fixture(t, {
        download: async () => {
            throw new AppError('STORAGE', 'Cannot save');
        }
    });
    const {ids} = queue.add(links(2));
    queue.start(ids);
    await queue.task;
    assert.equal(queue.running, false);
    assert.ok(queue.persistenceError);
    assert.equal(queue.files[1].status, 'interrupted');
});
test('removing queue entries does not delete downloaded files', t => {
    const f = fixture(t);
    const filename = path.join(f.directory, 'keep.txt');
    fs.writeFileSync(filename, 'keep');
    f.queue.add(links(1));
    f.queue.clear();
    assert.equal(fs.readFileSync(filename, 'utf8'), 'keep');
});
