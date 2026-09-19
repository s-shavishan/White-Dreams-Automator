/** නමෝ බුද්ධාය | 🤍 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes, timingSafeEqual} from 'node:crypto';
import {ConfigManager} from './env.js';
import {ActivityLog} from './core/log.js';
import {DownloadQueue} from './core/queue.js';
import {DownloadLinkGenerator} from './dl_gen.js';
import {AppError, asAppError, checkAbort} from './core/errors.js';
import {normalizeFiles, publicUrl} from './core/validation.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const STATIC = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
    ['/style.css', ['style.css', 'text/css; charset=utf-8']],
    ['/brand.svg', ['brand.svg', 'image/svg+xml']],

    ['/assets/Images/White-Dreams-Automator-Logo.svg', [
        'assets/Images/White-Dreams-Automator-Logo.svg',
        'image/svg+xml'
    ]],

    ['/assets/Images/LK.png', [
        'assets/Images/LK.png',
        'image/png'
    ]],

    ['/assets/Images/I.png', [
        'assets/Images/I.png',
        'image/png'
    ]],
]);
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
const BODY_LIMIT = 1024 * 1024;

export function readJson(req) {
    return new Promise((resolve, reject) => {
        let bytes = 0, chunks = [], settled = false;
        const finish = (error, result) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (error) reject(error); else resolve(result);
        };
        const timer = setTimeout(() => finish(new AppError('REQUEST_TIMEOUT', 'The request body took too long to arrive.', {status: 408})), 10000);
        req.on('data', chunk => {
            if (settled) return;
            bytes += chunk.length;
            if (bytes > BODY_LIMIT) {
                chunks = [];
                finish(new AppError('REQUEST_TOO_LARGE', 'The import exceeds the 1 MB request limit.', {status: 413}));
            } else chunks.push(chunk);
        });
        req.on('end', () => {
            if (settled) return;
            try {
                const value = bytes ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
                if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SyntaxError();
                finish(null, value);
            } catch {
                finish(new AppError('INVALID_JSON', 'The request is not a valid JSON object.'));
            }
        });
        req.on('aborted', () => finish(new AppError('REQUEST_ABORTED', 'The request was interrupted.', {status: 400})));
        req.on('error', error => finish(error));
    });
}

function json(res, status, body) {
    if (res.writableEnded || res.destroyed) return;
    res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'});
    res.end(JSON.stringify(body));
}

function matchesToken(value, token) {
    if (typeof value !== 'string' || value.length !== token.length) return false;
    const candidate = Buffer.from(value), expected = Buffer.from(token);
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function createApplication(options = {}) {
    const config = options.config || new ConfigManager(options);
    const log = options.log || new ActivityLog();
    const resolver = options.resolver || new DownloadLinkGenerator({config, log});
    const queue = new DownloadQueue({
        config,
        log,
        resolver,
        download: options.download,
        handoff: options.handoff,
        store: options.queueStore
    });
    const token = randomBytes(32).toString('hex');
    const clients = new Set();
    let origin = '', host = '', cookieName = '', extraction = null, extractionTask = null, closing = false;
    const desktop = options.desktop || {};
    const publicState = () => ({...queue.public(), extracting: Boolean(extraction)});
    const send = (client, event, data) => {
        if (client.destroyed || client.writableLength > 1024 * 1024) {
            client.destroy();
            clients.delete(client);
            return;
        }
        try {
            client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        } catch {
            client.destroy();
            clients.delete(client);
        }
    };
    const broadcast = (event, data) => {
        for (const client of clients) send(client, event, data);
    };
    queue.on('state', () => broadcast('state', publicState()));
    queue.on('patch', patch => broadcast('patch', patch));
    log.on('entry', entry => broadcast('log', entry));
    for (const warning of config.warnings) log.add('warn', warning, 'CONFIG');
    log.add('info', 'White Dreams | Automator 3.0.0 is ready.');

    const assertMutable = () => {
        if (closing) throw new AppError('SHUTTING_DOWN', 'The application is closing.', {status: 503});
        if (extraction) throw new AppError('EXTRACTION_BUSY', 'Wait for page extraction to finish, or cancel it first.', {status: 409});
        queue.assertIdle();
    };
    const handle = async (req, res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', CSP);
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
        res.setHeader('X-Frame-Options', 'DENY');
        if (req.headers.host !== host || (req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site')
            throw new AppError('FORBIDDEN_ORIGIN', 'This local application only accepts same-origin requests.', {status: 403});
        const url = new URL(req.url, origin);
        if (req.method === 'GET' && STATIC.has(url.pathname)) {
            const [name, type] = STATIC.get(url.pathname);
            const content = await fs.promises.readFile(path.join(ROOT, 'public', name));
            res.writeHead(200, {'Content-Type': type, 'Cache-Control': 'no-cache'});
            res.end(content);
            return;
        }
        if (req.method === 'GET' && url.pathname === '/api/bootstrap') {
            res.setHeader('Set-Cookie', `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/`);
            return json(res, 200, {
                ok: true, token, state: publicState(), config: config.public(), logs: log.entries,
                capabilities: {desktop: Boolean(desktop.pickDirectory), updates: Boolean(desktop.checkUpdates), idm: process.platform === 'win32'}
            });
        }
        const cookie = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
        if (!matchesToken(cookie, token)) throw new AppError('SESSION_REQUIRED', 'Reload the app to reconnect your session.', {status: 401});
        if (req.method === 'GET' && url.pathname === '/api/events') {
            if (clients.size >= 12) throw new AppError('TOO_MANY_CLIENTS', 'Too many open application windows.', {status: 429});
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform',
                'Connection': 'keep-alive'
            });
            clients.add(res);
            send(res, 'state', publicState());
            const heartbeat = setInterval(() => {
                if (!res.destroyed) res.write(': heartbeat\n\n');
            }, 15000);
            heartbeat.unref();
            res.on('close', () => {
                clearInterval(heartbeat);
                clients.delete(res);
            });
            return;
        }
        if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, {ok: true, ...publicState()});
        if (req.method === 'GET' && url.pathname === '/api/config') return json(res, 200, {ok: true, ...config.public()});
        if (req.method === 'GET' && url.pathname === '/api/diagnostics') {
            return json(res, 200, {
                ok: true,
                version: '3.0.0',
                platform: process.platform,
                node: process.versions.node,
                engine: config.settings.engine,
                idm: {
                    takeover: Boolean(config.settings.idmTakeover),
                    maxWaitMs: config.settings.idmMaxWaitMs,
                    detectedPath: config.public().idmPath || null
                },
                hasLicense: Boolean(config.getLicense()),
                licenseProtection: config.public().licenseProtection,
                state: {phase: queue.phase, summary: queue.summary(), persistenceError: queue.persistenceError},
                errorCounts: queue.files.reduce((counts, f) => {
                    if (f.error) counts[f.error.code] = (counts[f.error.code] || 0) + 1;
                    return counts;
                }, {}),
                log: log.entries.slice(-150),
                note: 'URLs, license keys, and local folder paths are excluded. Review filenames in the activity messages before sharing.'
            });
        }
        if (req.method !== 'POST') throw new AppError('NOT_FOUND', 'This route does not exist.', {status: 404});
        if (!matchesToken(req.headers['x-wd-token'], token)) throw new AppError('INVALID_TOKEN', 'The request token is invalid. Reload the application.', {status: 403});
        if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw new AppError('CONTENT_TYPE', 'Use an application/json request body.', {status: 415});
        const body = await readJson(req);
        switch (url.pathname) {
            case '/api/config':
            case '/api/config/license': {
                assertMutable();
                const wasTakeover = Boolean(config.settings.idmTakeover);
                const saved = config.update(
                    url.pathname.endsWith('/license') ? {license: body.license} : body
                );
                log.add('info', 'Settings saved.');
                if (saved.idmTakeover && !wasTakeover) {
                    log.add('warn', 'Full IDM control enabled. WhiteDreams will close any running IDM instance before each download. Do not use IDM manually while a job is running.', 'IDM');
                } else if (!saved.idmTakeover && wasTakeover) {
                    log.add('info', 'Full IDM control disabled. Downloads will be handed off to IDM without tracking.', 'IDM');
                }
                broadcast('config', saved);
                return json(res, 200, {ok: true, config: saved});
            }
            case '/api/import': {
                assertMutable();
                const files = body.files || (typeof body.text === 'string' ? body.text.split(/\r?\n/).map(v => v.trim()).filter(Boolean) : null);
                const result = queue.add(files, body.kind || 'direct');
                return json(res, 200, {ok: true, ...result, state: publicState()});
            }
            case '/api/extract': {
                assertMutable();
                const pageUrl = publicUrl(body.url);
                if (!config.getLicense()) throw new AppError('LICENSE_REQUIRED', 'Add your CloakBrowser license in Settings to load a page.');
                extraction = new AbortController();
                broadcast('state', publicState());
                const signal = extraction.signal;
                extractionTask = (async () => {
                    try {
                        const links = await resolver.extract(pageUrl, signal);
                        checkAbort(signal);
                        return {links, ...queue.add(links, 'page')};
                    } finally {
                        try {
                            await resolver.close();
                        } catch (e) {
                            log.error(e, 'Browser cleanup');
                        }
                        extraction = null;
                        broadcast('state', publicState());
                    }
                })();
                const result = await extractionTask;
                return json(res, 200, {ok: true, ...result, state: publicState()});
            }
            case '/api/extract/cancel':
                extraction?.abort();
                return json(res, 200, {ok: true});
            case '/api/start': {
                assertMutable();
                let ids = body.ids;
                if (!ids && body.files) {
                    const normalized = normalizeFiles(body.files, 'page');
                    queue.add(normalized);
                    ids = queue.files.filter(f => normalized.some(n => n.url === f.url)).map(f => f.id);
                }
                const count = queue.start(ids);
                return json(res, 200, {ok: true, count, state: publicState()});
            }
            case '/api/pause':
                queue.pause();
                break;
            case '/api/resume':
                queue.resume();
                break;
            case '/api/stop':
                queue.stop();
                break;
            case '/api/retry': {
                assertMutable();
                const ids = queue.files.filter(f => ['failed', 'interrupted', 'cancelled'].includes(f.status)).map(f => f.id);
                queue.start(ids);
                break;
            }
            case '/api/remove':
                assertMutable();
                queue.remove(body.ids);
                break;
            case '/api/clear':
                assertMutable();
                queue.clear();
                break;
            case '/api/pick-directory':
            case '/api/pick-idm': {
                assertMutable();
                const picker = url.pathname.endsWith('directory') ? desktop.pickDirectory : desktop.pickIdm;
                if (!picker) throw new AppError('DESKTOP_ONLY', 'The folder picker is available in the desktop app. You can type the path here.', {status: 501});
                return json(res, 200, {ok: true, path: await picker()});
            }
            case '/api/open-downloads': {
                if (!desktop.openDirectory) throw new AppError('DESKTOP_ONLY', 'Open the download folder using your file manager.', {status: 501});
                await desktop.openDirectory(config.settings.downloadDir);
                return json(res, 200, {ok: true});
            }
            case '/api/updates/check': {
                if (!desktop.checkUpdates) throw new AppError('DESKTOP_ONLY', 'Update checks are available in a packaged desktop build.', {status: 501});
                return json(res, 200, {ok: true, message: await desktop.checkUpdates()});
            }
            default:
                throw new AppError('NOT_FOUND', 'This route does not exist.', {status: 404});
        }
        json(res, 200, {ok: true, state: publicState()});
    };
    const server = http.createServer((req, res) => {
        handle(req, res).catch(error => {
            const e = asAppError(error);
            if (e.status >= 500) log.error(e, 'Request');
            if (!res.headersSent) json(res, e.status, {
                ok: false,
                error: e.message,
                code: e.code,
                retryable: e.retryable
            });
            else res.end();
        });
    });
    server.requestTimeout = 15000;
    server.headersTimeout = 10000;
    server.on('clientError', (_, socket) => {
        if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    });
    return {
        queue, log, config, server, publicState,
        async listen(port = 0) {
            await new Promise((resolve, reject) => {
                const fail = error => {
                    server.off('listening', ready);
                    reject(error);
                };
                const ready = () => {
                    server.off('error', fail);
                    resolve();
                };
                server.once('error', fail);
                server.once('listening', ready);
                server.listen(port, '127.0.0.1');
            });
            host = `127.0.0.1:${server.address().port}`;
            origin = `http://${host}`;
            console.log(`White Dreams Automator listening on ${origin}`);
            cookieName = 'wd_session_' + server.address().port;
            server.on('error', error => log.error(error, 'Local server'));
            return origin;
        },
        async close() {
            if (closing) return;
            closing = true;
            extraction?.abort();
            await Promise.allSettled([extractionTask, queue.shutdown()]);
            for (const client of clients) client.end();
            clients.clear();
            if (server.listening) await new Promise(resolve => {
                server.close(resolve);
                server.closeIdleConnections();
                server.closeAllConnections?.();
            });
        },
    };
}
