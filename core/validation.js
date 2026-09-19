/** නමෝ බුද්ධාය | 🤍 */

import path from 'node:path';
import net from 'node:net';
import dns from 'node:dns';
import {AppError} from './errors.js';

export const MAX_FILES = 2000;

export function isPublicAddress(address) {
    const host = address.toLowerCase().replace(/^\[|\]$/g, '');
    if (net.isIP(host) === 4) {
        const [a, b] = host.split('.').map(Number);
        return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
            (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && [0, 168].includes(b)) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && [18, 19].includes(b)));
    }
    // Public IPv6 global unicast only. Reject mapped IPv4, local and tunnel ranges.
    if (net.isIP(host) === 6) return /^[23][0-9a-f]{3}:/.test(host) && !/^200[12]:|^2001:(?:0:|db8:)/.test(host);
    return false;
}

export function publicUrl(value) {
    if (typeof value !== 'string' || value.length > 8192) throw new AppError('INVALID_URL', 'Enter a valid public HTTP or HTTPS URL.');
    let u;
    try {
        u = new URL(value.trim());
    } catch {
        throw new AppError('INVALID_URL', 'Enter a valid public HTTP or HTTPS URL.');
    }
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password)
        throw new AppError('INVALID_URL', 'Only HTTP(S) URLs without embedded credentials are supported.');
    const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (host === 'localhost' || /\.(localhost|local|internal|lan)$/.test(host) ||
        (!host.includes('.') && !net.isIP(host)) || (net.isIP(host) && !isPublicAddress(host)))
        throw new AppError('PRIVATE_URL', 'Local, private-network, and metadata-service URLs are not allowed.');
    u.hash = '';
    // Return the parsed URL, not the original input. Besides removing fragments,
    // this canonicalizes whitespace, host casing and default ports so equivalent
    // links cannot bypass queue de-duplication.
    return u.href;
}

// The transport uses this lookup, so redirects and DNS answers cannot target the LAN.
export function publicLookup(hostname, options, callback) {
    dns.lookup(hostname, {all: true, verbatim: true}, (error, addresses) => {
        if (error) return callback(error);
        if (!addresses.length || addresses.some(a => !isPublicAddress(a.address)))
            return callback(new AppError('PRIVATE_URL', 'The host resolves to a private or unsupported network.'));
        const matching = options?.family ? addresses.filter(a => a.family === options.family) : addresses;
        if (!matching.length) return callback(new AppError('NETWORK', 'No compatible address found.', {retryable: true}));
        if (options?.all) callback(null, matching);
        else callback(null, matching[0].address, matching[0].family);
    });
}

export function safeName(value) {
    let name = String(value || 'download').normalize('NFC')
        .replace(/[<>:"/\\|?*\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, '_')
        .replace(/\s+/g, ' ').replace(/^[. ]+|[. ]+$/g, '') || 'download';
    if (/^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/i.test(name)) name = '_' + name;
    // Keep room for collision suffixes and Windows path limits.
    const ext = path.extname(name).slice(0, 15);
    if (name.length > 160) name = name.slice(0, 160 - ext.length) + ext;
    return name;
}

export function nameFromUrl(value) {
    try {
        const u = new URL(value);
        return safeName(decodeURIComponent(u.hash?.slice(1) || u.pathname.split('/').pop() || 'download'));
    } catch {
        return 'download';
    }
}

export function normalizeFiles(input, defaultKind = 'direct') {
    if (!Array.isArray(input) || input.length < 1 || input.length > MAX_FILES)
        throw new AppError('INVALID_FILES', `Provide between 1 and ${MAX_FILES} files.`);
    const seen = new Set();
    const files = [];
    input.forEach((raw, index) => {
        const f = typeof raw === 'string' ? {url: raw} : raw;
        if (!f || typeof f !== 'object') throw new AppError('INVALID_FILES', `Invalid file at line ${index + 1}.`);
        let url;
        try {
            url = publicUrl(f.url);
        } catch (e) {
            throw new AppError(e.code, `Line ${index + 1}: ${e.message}`);
        }
        const kind = f.kind || defaultKind;
        if (!['direct', 'page'].includes(kind)) throw new AppError('INVALID_FILES', 'Link type must be direct or page.');
        const sha256 = f.sha256 || '';
        if (typeof sha256 !== 'string' || (sha256 && !/^[a-f0-9]{64}$/i.test(sha256)))
            throw new AppError('INVALID_CHECKSUM', `Invalid SHA-256 checksum at line ${index + 1}.`);
        if (!seen.has(url)) files.push({
            url,
            name: safeName(f.name || nameFromUrl(f.url)),
            kind,
            sha256: sha256.toLowerCase()
        });
        seen.add(url);
    });
    return files;
}
