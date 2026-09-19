/** නමෝ බුද්ධාය | 🤍 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {safeName, publicUrl, normalizeFiles, isPublicAddress} from '../core/validation.js';
import {JsonStore} from '../core/storage.js';
import {ConfigManager} from '../env.js';
import {redact} from '../core/log.js';
import {fixture, codec} from './helpers.js';

test('safe filenames handle Windows devices, traversal, bidi, and trailing dots', () => {
    for (const input of ['CON', 'aux.zip', '../a/b.zip', 'COM1.txt', 'hello\u202Eexe.zip', 'LPT¹.txt', 'a'.repeat(300)]) {
        const name = safeName(input);
        assert.ok(!/[<>:"/\\|?*\u202E]/.test(name));
        assert.ok(name.length <= 160);
    }
    assert.equal(safeName('report. '), 'report');
    assert.equal(safeName('CON'), '_CON');
});
test('public URLs block credentials, schemes, LAN, mapped IPv4 and metadata', () => {
    for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'https://user:pass@example.com', 'http://127.0.0.1', 'http://2130706433', 'http://0x7f000001', 'http://[::1]', 'http://[::ffff:127.0.0.1]', 'http://192.168.1.1', 'http://169.254.169.254', 'http://localhost.', 'http://router.local']) {
        assert.throws(() => publicUrl(url), {name: 'AppError'});
    }
    assert.equal(publicUrl('https://example.com/file#name.zip'), 'https://example.com/file');
    assert.equal(publicUrl('  HTTPS://EXAMPLE.COM:443/file  '), 'https://example.com/file');
    assert.equal(isPublicAddress('8.8.8.8'), true);
    assert.equal(isPublicAddress('10.10.10.10'), false);
});
test('normalization deduplicates and validates checksums', () => {
    const f = normalizeFiles(['https://example.com/a#file.zip', 'https://example.com/a']);
    assert.equal(f.length, 1);
    assert.equal(f[0].name, 'file.zip');
    assert.throws(() => normalizeFiles([{url: 'https://example.com', sha256: 'invalid'}]), {code: 'INVALID_CHECKSUM'});
    assert.throws(() => normalizeFiles([]), {code: 'INVALID_FILES'});
    assert.throws(() => normalizeFiles(Array(2001).fill('https://example.com')), {code: 'INVALID_FILES'});
});
test('atomic settings writes encrypt license and public config hides it', t => {
    const {config, directory} = fixture(t);
    config.update({license: 'test-license-key'});
    const stored = fs.readFileSync(path.join(directory, 'config.json'), 'utf8');
    assert.ok(!stored.includes('test-license-key'));
    assert.ok(!JSON.stringify(config.public()).includes('test-license-key'));
    assert.equal(new ConfigManager({directory, codec}).getLicense(), 'test-license-key');
    assert.throws(() => config.update({retries: 99}), {code: 'INVALID_CONFIG'});
    assert.equal(config.settings.retries, 0);
});
test('V2 plaintext settings migrate after explicit config initialization', t => {
    const {directory} = fixture(t);
    fs.writeFileSync(path.join(directory, 'config.json'), JSON.stringify({license: 'legacy-license'}));
    const config = new ConfigManager({directory, codec});
    assert.equal(config.getLicense(), 'legacy-license');
    assert.equal(config.public().licenseProtection, 'OS encrypted');
    assert.ok(!fs.readFileSync(path.join(directory, 'config.json'), 'utf8').includes('legacy-license'));
});
test('without encryption new key saving fails without destroying old config', t => {
    const {directory} = fixture(t);
    const config = new ConfigManager({directory});
    assert.throws(() => config.update({license: 'test-license'}), {code: 'ENCRYPTION_UNAVAILABLE'});
    assert.equal(config.getLicense(), '');
});
test('corrupt JSON is preserved, never silently discarded', t => {
    const {directory} = fixture(t), filename = path.join(directory, 'broken.json');
    fs.writeFileSync(filename, '{not-json');
    const store = new JsonStore(filename);
    assert.deepEqual(store.read({ok: true}), {ok: true});
    assert.ok(store.warning);
    assert.ok(fs.readdirSync(directory).some(name => name.startsWith('broken.json.corrupt-')));
});
test('redaction removes token-bearing URLs and secret assignments', () => {
    const output = redact('GET https://example.com/path?token=abc license=private-value');
    assert.ok(!output.includes('abc'));
    assert.ok(!output.includes('private-value'));
    assert.ok(!output.includes('example.com'));
});
