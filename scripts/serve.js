/** නමෝ බුද්ධාය | 🤍 */

import {createApplication} from '../server.js';

let application;
try {
    application = createApplication();
    const url = await application.listen(Number(process.env.WD_PORT) || 0);
    console.log(`White Dreams | Automator 3.0.0\nOpen ${url}\nPress Ctrl+C to close. Nothing starts automatically.`);
} catch (error) {
    console.error('Startup failed:', error.code || 'UNEXPECTED', error.message);
    process.exitCode = 1;
}
let closing = false;

async function close() {
    if (closing) return;
    closing = true;
    try {
        await application?.close();
    } catch {
        process.exitCode = 1;
    }
}

process.once('SIGINT', close);
process.once('SIGTERM', close);
process.on('unhandledRejection', error => {
    application?.log.error(error, 'Background task');
    void close();
});
