/** නමෝ බුද්ධාය | 🤍 */

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createHash, randomUUID} from 'node:crypto';
import {publicUrl, publicLookup, safeName} from './validation.js';
import {AppError, checkAbort, asAppError} from './errors.js';

export function requestStream(value, {signal, redirects = 5, lookup = publicLookup, validate = publicUrl} = {}) {
    checkAbort(signal);
    const url = new URL(validate(value));
    return new Promise((resolve, reject) => {
        const req = (url.protocol === 'https:' ? https : http).get(url, {
            signal, lookup, headers: {'User-Agent': 'WhiteDreams-Automator/3.0.0', 'Accept-Encoding': 'identity'},
        }, res => {
            const code = res.statusCode;
            if ([301, 302, 303, 307, 308].includes(code)) {
                res.destroy();
                if (!res.headers.location || redirects <= 0) return reject(new AppError('REDIRECT_LIMIT', 'Too many redirects or a missing redirect destination.'));
                try {
                    resolve(requestStream(new URL(res.headers.location, url).href, {
                        signal,
                        redirects: redirects - 1,
                        lookup,
                        validate
                    }));
                } catch (error) {
                    reject(error);
                }
                return;
            }
            if (code < 200 || code >= 300 || code === 206) {
                res.destroy();
                reject(new AppError('HTTP_' + code, `The download server returned HTTP ${code}. Check the link or try again.`, {
                    status: 502,
                    retryable: [408, 429, 500, 502, 503, 504].includes(code)
                }));
                return;
            }
            resolve(res);
        });
        req.setTimeout(30000, () => req.destroy(new AppError('TIMEOUT', 'No data arrived for 30 seconds. Check the connection.', {
            status: 504,
            retryable: true
        })));
        req.once('error', reject);
    });
}

export async function downloadFile(url, file, settings, signal, onProgress = () => {
}, transport = requestStream) {
    checkAbort(signal);
    await fsp.mkdir(settings.downloadDir, {recursive: true});
    const temp = path.join(settings.downloadDir, `.wd-${randomUUID()}.part`);
    let response, created = false;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, {once: true});
    if (signal?.aborted) controller.abort();
    let timedOut = false;
    const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, settings.timeoutMinutes * 60000);
    try {
        response = await transport(url, {signal: controller.signal});
        if (/text\/html|application\/xhtml/i.test(response.headers['content-type'] || ''))
            throw new AppError('HTML_RESPONSE', 'This URL returned a web page, not a file. Import it as a supported file-page link instead.');
        if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity')
            throw new AppError('CONTENT_ENCODING', 'The server ignored the uncompressed transfer request. Use IDM for this link.');
        const header = response.headers['content-length'];
        const totalBytes = header !== undefined && /^\d+$/.test(header) ? Number(header) : null;
        if (totalBytes !== null && !Number.isSafeInteger(totalBytes)) throw new AppError('INVALID_LENGTH', 'The server supplied an invalid file length.');
        const fd = await fsp.open(temp, 'wx', 0o600);
        created = true;
        const output = fd.createWriteStream();
        const hash = createHash('sha256');
        let bytes = 0, lastAt = Date.now(), lastBytes = 0;
        const started = Date.now();
        const meter = new Transform({
            transform(chunk, encoding, done) {
                try {
                    bytes += chunk.length;
                    hash.update(chunk);
                    const now = Date.now();
                    if (now - lastAt >= 300) {
                        onProgress({
                            bytes,
                            totalBytes,
                            speed: Math.round((bytes - lastBytes) * 1000 / Math.max(1, now - lastAt)),
                            elapsed: Math.round((now - started) / 1000)
                        });
                        lastAt = now;
                        lastBytes = bytes;
                    }
                    done(null, chunk);
                } catch (error) {
                    done(error);
                }
            }
        });
        await pipeline(response, meter, output, {signal: controller.signal});
        checkAbort(controller.signal);
        if (totalBytes !== null && bytes !== totalBytes) throw new AppError('INCOMPLETE', 'The received file length does not match the server. Retry the file.', {retryable: true});
        const checksum = hash.digest('hex');
        if (file.sha256 && file.sha256 !== checksum) throw new AppError('CHECKSUM_MISMATCH', 'SHA-256 verification failed. The file was not saved as complete.');
        const name = safeName(file.name);
        const ext = path.extname(name), stem = name.slice(0, name.length - ext.length);
        let outputName, finalized = false;
        for (let index = 0; index < 10000; index++) {
            checkAbort(controller.signal);
            outputName = index ? `${stem} (${index})${ext}` : name;
            try {
                // Hard-link finalization is atomic and cannot replace an existing file.
                await fsp.link(temp, path.join(settings.downloadDir, outputName));
                finalized = true;
                break;
            } catch (e) {
                if (e.code === 'EEXIST') continue;
                if (['ENOTSUP', 'EPERM', 'EXDEV', 'EOPNOTSUPP'].includes(e.code)) {
                    try {
                        await fsp.copyFile(temp, path.join(settings.downloadDir, outputName), fs.constants.COPYFILE_EXCL);
                        finalized = true;
                        break;
                    } catch (copyError) {
                        if (copyError.code === 'EEXIST') continue;
                        throw copyError;
                    }
                }
                throw e;
            }
        }
        if (!finalized) throw new AppError('FILE_EXISTS', 'Could not find a free destination filename.');
        return {
            status: 'completed',
            outputName,
            bytes,
            totalBytes: bytes,
            speed: 0,
            checksum,
            elapsed: Math.round((Date.now() - started) / 1000)
        };
    } catch (error) {
        if (timedOut) throw new AppError('TIMEOUT', 'The file exceeded the transfer time limit. Increase it in Settings.', {
            status: 504,
            retryable: true
        });
        checkAbort(signal);
        throw asAppError(error);
    } finally {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
        response?.destroy();
        // Only this invocation's private .part file is removed. Never touch user files.
        if (created) await fsp.unlink(temp).catch(() => {
        });
    }
}
