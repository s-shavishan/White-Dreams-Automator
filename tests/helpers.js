/** නමෝ බුද්ධාය | 🤍 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ConfigManager} from '../env.js';
import {ActivityLog} from '../core/log.js';
import {DownloadQueue} from '../core/queue.js';

export const codec = {
    encrypt: value => Buffer.from('test:' + value).toString('base64'),
    decrypt: value => Buffer.from(value, 'base64').toString().slice(5)
};

export function fixture(t, overrides = {}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-v3-test-'));
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    const config = new ConfigManager({directory, codec});
    config.update({downloadDir: path.join(directory, 'downloads'), retries: 0});
    const log = new ActivityLog();
    const resolver = {
        resolve: async url => url, extract: async () => [], close: async () => {
        }
    };
    const download = async () => ({status: 'completed', bytes: 32, totalBytes: 32, speed: 0});
    const args = {config, log, resolver, download, ...overrides};
    return {...args, directory, queue: new DownloadQueue(args)};
}

export const links = count => Array.from({length: count}, (_, i) => ({
    name: `file-${i + 1}.zip`,
    url: `https://example.com/file-${i + 1}.zip`,
    kind: 'direct'
}));

export async function eventually(predicate, timeout = 3000) {
    const start = Date.now();
    while (!predicate()) {
        if (Date.now() - start > timeout) throw new Error('Condition timed out');
        await new Promise(resolve => setTimeout(resolve, 10));
    }
}
