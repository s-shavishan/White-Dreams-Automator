/** නමෝ බුද්ධාය | 🤍 */

/** Browser adapter. Automated captcha Verifications via Cloak Pro Chromium V156 By Cloak HQ */

import {AppError, asAppError, checkAbort, abortable} from './core/errors.js';
import {publicUrl} from './core/validation.js';

export class BrowserResolver {
    constructor({getLicense, log, launch} = {}) {
        Object.assign(this, {getLicense, log, launch});
        this.browser = null;
        this.page = null;
        this.starting = null;
        this.generation = 0;
    }

    async start() {
        if (this.browser?.isConnected()) return;
        if (this.starting) return this.starting;
        const generation = this.generation;
        const starting = (async () => {
            if (!this.getLicense()) throw new AppError('LICENSE_REQUIRED', 'Add your CloakBrowser license in Settings.');
            this.log.add('info', 'Opening the resolver browser. Complete any site verification manually.');
            const launch = this.launch || (await import('cloakbrowser')).launch;
            let browser;
            try {
                browser = await launch({licenseKey: this.getLicense(), headless: false});
            } catch (cause) {
                throw new AppError('BROWSER_START', 'Could not start CloakBrowser. Check your license, installation, and connection.', {
                    status: 503,
                    cause
                });
            }
            if (generation !== this.generation) {
                await browser.close();
                throw new AppError('CANCELLED', 'Browser startup cancelled.');
            }
            this.browser = browser;
            browser.on('disconnected', () => {
                if (this.browser === browser) {
                    this.browser = null;
                    this.page = null;
                }
            });
        })();
        this.starting = starting;
        try {
            await starting;
        } finally {
            if (this.starting === starting) this.starting = null;
        }
    }

    async withPage(signal, operation) {
        checkAbort(signal);
        const onAbort = () => {
            this.close().catch(e => this.log.error(e, 'Browser cancellation'));
        };
        signal?.addEventListener('abort', onAbort, {once: true});
        try {
            await abortable(this.start(), signal);
            checkAbort(signal);
            if (!this.page || this.page.isClosed()) {
                this.page = await abortable(this.browser.newPage(), signal);
                this.page.setDefaultTimeout(30000);
                this.page.on('popup', popup => {
                    popup.close().catch(() => {
                    });
                });
                // Block obvious local-network navigation and non-web requests from remote content.
                await abortable(this.page.route('**/*', route => {
                    try {
                        publicUrl(route.request().url());
                        return route.continue();
                    } catch {
                        return route.abort('blockedbyclient');
                    }
                }), signal);
            }
            checkAbort(signal);
            return await abortable(operation(this.page), signal);
        } catch (e) {
            checkAbort(signal);
            if (e instanceof AppError) throw e;
            if (e?.message?.includes('has been closed')) throw new AppError('BROWSER_CLOSED', 'The resolver browser was closed. Retry to open a new session.', {
                status: 503,
                retryable: true
            });
            throw asAppError(e);
        } finally {
            signal?.removeEventListener('abort', onAbort);
        }
    }

    async navigate(page, url) {
        const response = await page.goto(publicUrl(url), {waitUntil: 'domcontentloaded', timeout: 60000});
        if (response && response.status() >= 400 && ![403, 429].includes(response.status()))
            throw new AppError('PAGE_HTTP', `The page returned HTTP ${response.status()}. Check the page URL.`, {status: 502});
        await page.bringToFront();
    }

    async waitForVerification(page) {
        const selector = 'input[name="cf-turnstile-response"], input[name="g-recaptcha-response"]';
        const required = await page.locator('#cf-turnstile, .cf-turnstile, iframe[src*="challenges.cloudflare.com"], ' + selector).count();
        if (!required) return;
        this.log.add('info', 'Waiting for site verification. Use the visible browser window; Automator will continue when the site permits it.');
        try {
            await page.waitForFunction(selector => {
                const input = document.querySelector(selector);
                return Boolean(input?.value?.length > 10 || (typeof window.turnstileToken === 'string' && window.turnstileToken.length > 10));
            }, selector, {timeout: 120000, polling: 500});
        } catch (cause) {
            throw new AppError('VERIFICATION_REQUIRED', 'Verification was not completed. Complete it in the visible browser and retry.', {
                status: 409,
                cause
            });
        }
    }

    async close() {
        this.generation++;
        this.starting = null;
        const browser = this.browser;
        this.browser = null;
        this.page = null;
        if (browser) {
            let timer;
            try {
                await Promise.race([browser.close(), new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new AppError('BROWSER_CLEANUP', 'The resolver browser did not close promptly. Close its window manually if it remains open.', {status: 503})), 5000);
                })]);
            } finally {
                clearTimeout(timer);
            }
        }
    }
}

export const createResolver = options => new BrowserResolver(options);
