/** නමෝ බුද්ධාය | 🤍 */

import {EventEmitter} from 'node:events';
import {asAppError} from './errors.js';

export function redact(value) {
    return String(value).replace(/https?:\/\/[^\s<>"']+/gi, '[URL redacted]')
        .replace(/(?:license|token|authorization|password|secret)\s*[:=]\s*\S+/gi, '[secret redacted]').slice(0, 800);
}

export class ActivityLog extends EventEmitter {
    entries = [];
    counter = 0;

    add(level, message, code = '') {
        const entry = {id: ++this.counter, time: new Date().toISOString(), level, message: redact(message), code};
        this.entries.push(entry);
        if (this.entries.length > 500) this.entries.shift();
        this.emit('entry', entry);
        return entry;
    }

    error(error, context = '') {
        const e = asAppError(error);
        this.add('error', `${context ? context + ': ' : ''}${e.message}`, e.code);
    }
}
