/** නමෝ බුද්ධාය | 🤍 */

import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {AppError} from './errors.js';

/** Atomic writes: a failed save must not replace a healthy previous file. */
export class JsonStore {
    constructor(filename) {
        this.filename = filename;
        this.warning = null;
    }

    read(fallback, validate = () => true) {
        try {
            if (fs.statSync(this.filename).size > 8 * 1024 * 1024) throw new SyntaxError('Oversize state');
            const data = JSON.parse(fs.readFileSync(this.filename, 'utf8'));
            if (!validate(data)) throw new SyntaxError('Invalid state schema');
            return data;
        } catch (error) {
            if (error.code === 'ENOENT') return fallback;
            if (!(error instanceof SyntaxError)) throw error;
            const backup = this.filename + '.corrupt-' + Date.now();
            fs.renameSync(this.filename, backup);
            this.warning = 'An unreadable saved file was preserved as a .corrupt backup. Defaults have been loaded.';
            return fallback;
        }
    }

    write(value) {
        fs.mkdirSync(path.dirname(this.filename), {recursive: true, mode: 0o700});
        const temporary = this.filename + '.' + randomUUID() + '.tmp';
        let fd;
        try {
            fd = fs.openSync(temporary, 'wx', 0o600);
            fs.writeFileSync(fd, JSON.stringify(value, null, 2), 'utf8');
            fs.fsyncSync(fd);
            fs.closeSync(fd);
            fd = undefined;
            fs.renameSync(temporary, this.filename);
        } catch (cause) {
            throw new AppError('STORAGE', 'Could not save application data. Check disk space and folder permissions.', {
                status: 507,
                cause
            });
        } finally {
            if (fd !== undefined) fs.closeSync(fd);
            try {
                fs.unlinkSync(temporary);
            } catch { /* Only our own temporary file. */
            }
        }
    }
}
