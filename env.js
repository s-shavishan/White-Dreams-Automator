/** නමෝ බුද්ධාය | 🤍 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {JsonStore} from './core/storage.js';
import {AppError} from './core/errors.js';
import {detectIDM} from './core/idm.js';

export class ConfigManager {
    constructor({
                    directory = process.env.WD_CONFIG_DIR || path.join(os.homedir(), '.white-dreams'),
                    codec,
                    legacyDirectories = []
                } = {}) {
        this.directory = directory;
        this.codec = codec;
        this.store = new JsonStore(path.join(directory, 'config.json'));
        this.warnings = [];
        this.defaults = {
            engine: 'native',
            downloadDir: path.join(os.homedir(), 'Downloads', 'White Dreams'),
            idmPath: '',
            idmTakeover: false,
            idmMaxWaitMs: 6 * 60 * 60 * 1000,
            retries: 2,
            retryDelayMs: 1500,
            timeoutMinutes: 120,
            selector: '#plaintext a[href]',
            theme: 'light',
            compact: false
        };
        let raw = this.store.read({}, value => value && typeof value === 'object' && !Array.isArray(value));
        if (!fs.existsSync(this.store.filename) && !this.store.warning) {
            for (const dir of legacyDirectories) {
                const source = path.join(dir, 'config.json');
                if (source === this.store.filename || !fs.existsSync(source)) continue;
                try {
                    const candidate = JSON.parse(fs.readFileSync(source, 'utf8'));
                    if (typeof candidate.license === 'string' || candidate.encryptedLicense) {
                        raw = candidate;
                        this.warnings.push('V2 settings were imported. The original V2 settings file was left untouched.');
                        break;
                    }
                } catch {
                    this.warnings.push('An older settings file could not be imported. Add the license again if needed.');
                }
            }
        }
        if (this.store.warning) this.warnings.push(this.store.warning);
        this.settings = {...this.defaults};
        for (const key of Object.keys(this.defaults)) {
            if (Object.hasOwn(raw, key)) {
                try {
                    Object.assign(this.settings, this.validate({[key]: raw[key]}));
                } catch {
                    this.warnings.push(`Invalid saved ${key} setting was replaced with its default.`);
                }
            }
        }
        this.encryptedLicense = typeof raw.encryptedLicense === 'string' ? raw.encryptedLicense : '';
        this.license = typeof raw.license === 'string' ? raw.license : '';
        if (this.encryptedLicense && codec) {
            try {
                this.license = codec.decrypt(this.encryptedLicense);
            } catch {
                this.warnings.push('The stored license could not be decrypted on this machine. Enter it again.');
            }
        }
        if (this.license && codec) {
            this.encryptedLicense = codec.encrypt(this.license);
            this.store.write(this.serialize());
        }
    }

    serialize(settings = this.settings, encryptedLicense = this.encryptedLicense, license = this.license) {
        return {version: 3, ...settings, ...(encryptedLicense ? {encryptedLicense} : license ? {license} : {})};
    }

    validate(patch) {
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new AppError('INVALID_CONFIG', 'Settings must be a JSON object.');
        const next = {};
        for (const [key, value] of Object.entries(patch)) {
            if (['license', 'clearLicense'].includes(key)) continue;
            if (!Object.hasOwn(this.defaults, key)) throw new AppError('INVALID_CONFIG', `Unknown setting: ${key}.`);
            if (key === 'engine' && !['native', 'idm'].includes(value)) throw new AppError('INVALID_CONFIG', 'Choose Built-in or IDM as the download engine.');
            if (key === 'theme' && !['light', 'dark', 'system'].includes(value)) throw new AppError('INVALID_CONFIG', 'Choose a supported theme.');
            if (key === 'compact' && typeof value !== 'boolean') throw new AppError('INVALID_CONFIG', 'Compact mode must be true or false.');
            if (key === 'idmTakeover' && typeof value !== 'boolean') throw new AppError('INVALID_CONFIG', 'IDM takeover must be true or false.');
            const ranges = {retries: [0, 5], retryDelayMs: [500, 30000], timeoutMinutes: [1, 1440], idmMaxWaitMs: [60_000, 24 * 60 * 60 * 1000] };
            if (ranges[key] && (!Number.isInteger(value) || value < ranges[key][0] || value > ranges[key][1])) throw new AppError('INVALID_CONFIG', `Invalid ${key} value.`);
            if (['downloadDir', 'idmPath', 'selector'].includes(key) && (typeof value !== 'string' || value.length > 1024 || /[\x00-\x1f]/.test(value))) throw new AppError('INVALID_CONFIG', `Invalid ${key} value.`);
            if (key === 'downloadDir' && (!value.trim() || !path.isAbsolute(value))) throw new AppError('INVALID_CONFIG', 'Choose an absolute download folder path.');
            if (key === 'idmPath' && value && (!path.isAbsolute(value) || path.basename(value).toLowerCase() !== 'idman.exe')) throw new AppError('INVALID_CONFIG', 'Choose the installed IDMan.exe executable.');
            if (key === 'selector' && (!value.trim() || value.length > 200)) throw new AppError('INVALID_CONFIG', 'The page link selector must contain 1–200 characters.');
            next[key] = typeof value === 'string' ? value.trim() : value;
        }
        return next;
    }

    update(patch) {
        const settings = {...this.settings, ...this.validate(patch)};

        if (settings.idmTakeover && settings.engine !== 'idm') {
            throw new AppError(
                'INVALID_CONFIG',
                'IDM takeover can only be enabled when the IDM engine is selected.'
            );
        }

        let license = this.license, encrypted = this.encryptedLicense;
        if (patch.clearLicense === true) {
            license = '';
            encrypted = '';
        }
        if (Object.hasOwn(patch, 'license') && typeof patch.license !== 'string') throw new AppError('INVALID_LICENSE', 'The license must be text.');
        if (patch.license?.trim()) {
            license = patch.license.trim();
            if (license.length < 8 || license.length > 2048) throw new AppError('INVALID_LICENSE', 'Enter a license key between 8 and 2048 characters.');
            if (!this.codec) throw new AppError('ENCRYPTION_UNAVAILABLE', 'Secure key storage is unavailable. Use the desktop app, or set WD_LICENSE for this Node session.', {status: 503});
            encrypted = this.codec.encrypt(license);
        }
        this.store.write(this.serialize(settings, encrypted, license));
        Object.assign(this, {settings, license, encryptedLicense: encrypted});
        return this.public();
    }

    getLicense() {
        return process.env.WD_LICENSE || this.license || '';
    }

    public() {
        return {
            ...this.settings, idmPath: this.settings.idmPath || detectIDM(),
            hasLicense: Boolean(this.getLicense()), canSaveLicense: Boolean(this.codec),
            licenseProtection: process.env.WD_LICENSE ? 'environment' : this.encryptedLicense ? 'OS encrypted' : this.license ? 'legacy plain text' : 'not configured',
            configPath: this.store.filename, warnings: this.warnings
        };
    }
}
