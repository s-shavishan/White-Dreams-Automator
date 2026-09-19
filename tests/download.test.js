/** නමෝ බුද්ධාය | 🤍 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {downloadFile, requestStream} from '../core/download.js';
import {publicUrl} from '../core/validation.js';
import {fixture} from './helpers.js';

const content = Buffer.from('White Dreams 3.0.0 — harmless local fixture.');

async function network(t) {
    const f = fixture(t);
    const server = http.createServer((req, res) => {
        if (req.url === '/redirect') {
            res.writeHead(302, {location: '/file'});
            res.end();
        } else if (req.url === '/private') {
            res.writeHead(302, {location: 'http://169.254.169.254/latest'});
            res.end();
        } else if (req.url === '/missing') {
            res.writeHead(404);
            res.end();
        } else if (req.url === '/html') {
            res.writeHead(200, {'Content-Type': 'text/html'});
            res.end('<html>Not a file</html>');
        } else if (req.url === '/incomplete') {
            res.writeHead(200, {'Content-Length': 1000});
            res.write(content);
            setTimeout(() => res.destroy(), 20);
        } else if (req.url === '/slow') {
            res.writeHead(200, {'Content-Length': 100000});
            const timer = setInterval(() => res.write('x'), 10);
            res.on('close', () => clearInterval(timer));
        } else {
            res.writeHead(200, {'Content-Type': 'application/octet-stream', 'Content-Length': content.length});
            res.end(content);
        }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    t.after(async () => {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    });
    const transport = (url, options) => requestStream(url, {
        ...options,
        validate: value => new URL(value).origin === origin ? value : publicUrl(value)
    });
    return {...f, origin, transport};
}

test('managed transfer follows redirects, checks length, and computes SHA-256', async t => {
    const f = await network(t), checksum = createHash('sha256').update(content).digest('hex');
    const result = await downloadFile(f.origin + '/redirect', {
        name: 'fixture.bin',
        sha256: checksum
    }, f.config.settings, undefined, () => {
    }, f.transport);
    assert.equal(result.status, 'completed');
    assert.equal(result.bytes, content.length);
    assert.equal(result.checksum, checksum);
    assert.deepEqual(fs.readFileSync(path.join(f.config.settings.downloadDir, result.outputName)), content);
});
test('existing files are preserved and a unique collision name is used', async t => {
    const f = await network(t);
    fs.mkdirSync(f.config.settings.downloadDir, {recursive: true});
    fs.writeFileSync(path.join(f.config.settings.downloadDir, 'keep.bin'), 'keep');
    const result = await downloadFile(f.origin + '/file', {name: 'keep.bin'}, f.config.settings, undefined, () => {
    }, f.transport);
    assert.equal(result.outputName, 'keep (1).bin');
    assert.equal(fs.readFileSync(path.join(f.config.settings.downloadDir, 'keep.bin'), 'utf8'), 'keep');
});
test('checksum mismatch leaves no completed file or owned partial', async t => {
    const f = await network(t);
    await assert.rejects(downloadFile(f.origin + '/file', {
        name: 'bad.bin',
        sha256: '0'.repeat(64)
    }, f.config.settings, undefined, () => {
    }, f.transport), {code: 'CHECKSUM_MISMATCH'});
    assert.deepEqual(fs.readdirSync(f.config.settings.downloadDir), []);
});
test('HTTP failures and HTML bodies are not marked completed', async t => {
    const f = await network(t);
    await assert.rejects(downloadFile(f.origin + '/missing', {name: 'missing.bin'}, f.config.settings, undefined, () => {
    }, f.transport), {code: 'HTTP_404'});
    await assert.rejects(downloadFile(f.origin + '/html', {name: 'html.bin'}, f.config.settings, undefined, () => {
    }, f.transport), {code: 'HTML_RESPONSE'});
});
test('truncated transfer fails instead of a false stable-size success', async t => {
    const f = await network(t);
    await assert.rejects(downloadFile(f.origin + '/incomplete', {name: 'short.bin'}, f.config.settings, undefined, () => {
    }, f.transport));
    assert.deepEqual(fs.readdirSync(f.config.settings.downloadDir), []);
});
test('private redirect targets are blocked before a request', async t => {
    const f = await network(t);
    await assert.rejects(downloadFile(f.origin + '/private', {name: 'private.bin'}, f.config.settings, undefined, () => {
    }, f.transport), {code: 'PRIVATE_URL'});
});
test('abort stops a streaming transfer and removes only its own partial', async t => {
    const f = await network(t);
    fs.mkdirSync(f.config.settings.downloadDir, {recursive: true});
    fs.writeFileSync(path.join(f.config.settings.downloadDir, '.wd-other-user.part'), 'preserve');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 80);
    await assert.rejects(downloadFile(f.origin + '/slow', {name: 'slow.bin'}, f.config.settings, controller.signal, () => {
    }, f.transport), {code: 'CANCELLED'});
    clearTimeout(timer);
    assert.deepEqual(fs.readdirSync(f.config.settings.downloadDir), ['.wd-other-user.part']);
});
test('a failed progress observer rejects the transfer and cleans its partial', async t => {
    const f = await network(t);
    await assert.rejects(downloadFile(f.origin + '/slow', {name: 'observer.bin'}, f.config.settings, undefined, () => {
        throw new Error('Observer failed');
    }, f.transport), {code: 'UNEXPECTED'});
    assert.deepEqual(fs.readdirSync(f.config.settings.downloadDir), []);
});
