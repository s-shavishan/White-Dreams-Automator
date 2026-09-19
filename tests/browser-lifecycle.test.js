/** නමෝ බුද්ධාය | 🤍 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {BrowserResolver} from '../bypass.js';
import {ActivityLog} from '../core/log.js';
import {eventually} from './helpers.js';

function mockBrowser() {
    const b = new EventEmitter();
    b.closed = false;
    b.isConnected = () => !b.closed;
    b.close = async () => {
        b.closed = true;
        b.emit('disconnected');
    };
    b.newPage = async () => ({
        isClosed: () => b.closed, setDefaultTimeout() {
        }, on() {
        }, route: async () => {
        }
    });
    return b;
}

test('concurrent startup shares one browser and closed resolvers can restart', async () => {
    let launches = 0;
    const resolver = new BrowserResolver({
        getLicense: () => 'test-license',
        log: new ActivityLog(),
        launch: async () => {
            launches++;
            return mockBrowser();
        }
    });
    await Promise.all([resolver.start(), resolver.start()]);
    assert.equal(launches, 1);
    await resolver.close();
    await resolver.start();
    assert.equal(launches, 2);
    await resolver.close();
});
test('cancel during browser startup returns promptly and closes a late browser', async () => {
    let finish;
    const b = mockBrowser(), launch = new Promise(resolve => {
        finish = resolve;
    });
    const resolver = new BrowserResolver({
        getLicense: () => 'test-license',
        log: new ActivityLog(),
        launch: () => launch
    });
    const controller = new AbortController();
    const running = resolver.withPage(controller.signal, async () => 'unexpected');
    controller.abort();
    await assert.rejects(running, {code: 'CANCELLED'});
    finish(b);
    await eventually(() => b.closed);
    assert.equal(resolver.browser, null);
});
test('cancel during a page operation does not wait for a stuck SDK promise', async () => {
    const resolver = new BrowserResolver({
        getLicense: () => 'test-license',
        log: new ActivityLog(),
        launch: async () => mockBrowser()
    });
    const controller = new AbortController();
    let entered = false;
    const result = resolver.withPage(controller.signal, () => {
        entered = true;
        return new Promise(() => {
        });
    });
    await eventually(() => entered);
    controller.abort();
    await assert.rejects(result, {code: 'CANCELLED'});
    await resolver.close();
});
test('a cancelled pending startup does not block or replace a new session', async () => {
    let finish, launches = 0;
    const oldBrowser = mockBrowser(), newBrowser = mockBrowser();
    const pending = new Promise(resolve => {
        finish = resolve;
    });
    const resolver = new BrowserResolver({
        getLicense: () => 'test-license',
        log: new ActivityLog(),
        launch: () => ++launches === 1 ? pending : Promise.resolve(newBrowser)
    });
    const controller = new AbortController();
    const first = resolver.withPage(controller.signal, async () => 'unexpected');
    controller.abort();
    await assert.rejects(first, {code: 'CANCELLED'});
    await resolver.start();
    assert.equal(resolver.browser, newBrowser);
    finish(oldBrowser);
    await eventually(() => oldBrowser.closed);
    assert.equal(resolver.browser, newBrowser);
    assert.equal(newBrowser.closed, false);
    await resolver.close();
});
test('cancel during page creation returns promptly', async () => {
    const browser = mockBrowser();
    let entered = false;
    browser.newPage = () => {
        entered = true;
        return new Promise(() => {
        });
    };
    const resolver = new BrowserResolver({
        getLicense: () => 'test-license',
        log: new ActivityLog(),
        launch: async () => browser
    });
    const controller = new AbortController();
    const running = resolver.withPage(controller.signal, async () => 'unexpected');
    await eventually(() => entered);
    controller.abort();
    await assert.rejects(running, {code: 'CANCELLED'});
    assert.equal(browser.closed, true);
});
