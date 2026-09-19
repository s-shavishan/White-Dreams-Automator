/** නමෝ බුද්ධාය | 🤍 */
/** Shared, actionable errors. Never return raw stacks or request URLs to the renderer. */

export class AppError extends Error {
    constructor(code, message, {status = 400, retryable = false, cause} = {}) {
        super(message, {cause});
        this.name = 'AppError';
        Object.assign(this, {code, status, retryable});
    }
}

export function asAppError(error) {
    if (error instanceof AppError) return error;
    const code = error?.code || error?.cause?.code;
    if (error?.name === 'AbortError' || code === 'ABORT_ERR')
        return new AppError('CANCELLED', 'Operation cancelled.', {status: 409});
    if (code === 'ENOSPC') return new AppError('DISK_FULL', 'The destination disk is full. Free some space and retry.', {status: 507});
    if (['EACCES', 'EPERM', 'EROFS'].includes(code))
        return new AppError('FILE_ACCESS', 'Cannot access the selected folder. Choose a writable folder in Settings.', {status: 500});
    if (code === 'EEXIST') return new AppError('FILE_EXISTS', 'A destination file already exists. Existing files will not be overwritten.', {status: 409});
    if (['ENAMETOOLONG', 'ENOENT', 'ENOTDIR'].includes(code)) return new AppError('FILE_PATH', 'The file path is unavailable or too long. Choose a shorter, existing download folder.', {status: 500});
    if (['ETIMEDOUT', 'ESOCKETTIMEDOUT'].includes(code) || error?.name === 'TimeoutError')
        return new AppError('TIMEOUT', 'The operation timed out. Check the connection or finish verification in the browser.', {
            status: 504,
            retryable: true
        });
    if (['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE', 'ERR_STREAM_PREMATURE_CLOSE'].includes(code))
        return new AppError('NETWORK', 'Connection interrupted. Check your network and try again.', {
            status: 502,
            retryable: true
        });
    if (code === 'ERR_MODULE_NOT_FOUND') return new AppError('DEPENDENCY_MISSING', 'A required package is missing. Run npm install in the application folder.', {status: 503});
    return new AppError('UNEXPECTED', 'An unexpected error occurred. Open Diagnostics and retry the operation.', {status: 500});
}

export const errorData = error => {
    const e = asAppError(error);
    return {code: e.code, message: e.message, retryable: e.retryable};
};

export function checkAbort(signal) {
    if (signal?.aborted) throw new AppError('CANCELLED', 'Operation cancelled.', {status: 409});
}

/** Stop waiting immediately while still observing late completion/rejection safely. */
export function abortable(promise, signal) {
    if (!signal) return promise;
    return new Promise((resolve, reject) => {
        const abort = () => {
            signal.removeEventListener('abort', abort);
            reject(new AppError('CANCELLED', 'Operation cancelled.', {status: 409}));
        };
        signal.addEventListener('abort', abort, {once: true});
        Promise.resolve(promise).then(value => {
            signal.removeEventListener('abort', abort);
            resolve(value);
        }, error => {
            signal.removeEventListener('abort', abort);
            reject(error);
        });
        if (signal.aborted) abort();
    });
}

export function delay(ms, signal) {
    return new Promise((resolve, reject) => {
        const abort = () => {
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
            reject(new AppError('CANCELLED', 'Operation cancelled.', {status: 409}));
        };
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', abort);
            resolve();
        }, ms);
        signal?.addEventListener('abort', abort, {once: true});
        if (signal?.aborted) abort();
    });
}
