/** නමෝ බුද්ධාය | 🤍 */

import {createResolver} from './bypass.js';
import {AppError, checkAbort} from './core/errors.js';
import {normalizeFiles, publicUrl} from './core/validation.js';

export class DownloadLinkGenerator {
    constructor({config, log, browser} = {}) {
        this.config = config;
        this.log = log;
        this.browser = browser || createResolver({getLicense: () => config.getLicense(), log});
    }

    async extract(pageUrl, signal) {
        return this.browser.withPage(signal, async page => {
            await this.browser.navigate(page, pageUrl);
            const selector = this.config.settings.selector;
            this.log.add('info', 'Waiting for the page file list. Site verification may need your attention.');
            try {
                await page.waitForSelector(selector, {state: 'attached', timeout: 120000});
            } catch (cause) {
                throw new AppError('FILE_LIST_MISSING', 'No matching file list was found. Complete site verification or check the CSS selector in Settings.', {
                    status: 422,
                    cause
                });
            }
            checkAbort(signal);
            const raw = await page.$$eval(selector, anchors => anchors.map(a => ({
                url: a.href,
                name: (a.textContent || '').trim(),
                kind: 'page'
            })).filter(a => /^https?:\/\//.test(a.url)));
            if (!raw.length) throw new AppError('NO_LINKS', 'The page did not contain any matching HTTP(S) file links.');
            return normalizeFiles(raw, 'page');
        });
    }

    async resolve(primaryUrl, signal) {

        const url = new URL(publicUrl(primaryUrl));

        if (url.hostname === 'dl.fuckingfast.co') return url.href;
        if (!['fuckingfast.co', 'www.fuckingfast.co'].includes(url.hostname))
            throw new AppError('UNSUPPORTED_PROVIDER', 'This file-page host is not supported. Import a direct file URL instead.');
        return this.browser.withPage(signal, async page => {
            await this.browser.navigate(page, url.href);
            await this.browser.waitForVerification(page);
            checkAbort(signal);
            const endpoint = await page.locator('[hx-post]').first().getAttribute('hx-post');
            if (!endpoint) throw new AppError('ENDPOINT_MISSING', 'The file page did not advertise a download action. The site may have changed.');
            const endpointUrl = new URL(endpoint, page.url());
            if (endpointUrl.origin !== new URL(page.url()).origin) throw new AppError('UNSAFE_ENDPOINT', 'The page supplied an unexpected cross-site download action.');
            const result = await page.evaluate(async endpointUrl => {
                const token = document.querySelector('input[name="cf-turnstile-response"]')?.value || window.turnstileToken || '';
                const form = new URLSearchParams();
                if (token) form.set('cf-turnstile-response', token);
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 30000);
                try {
                    const response = await fetch(endpointUrl, {
                        method: 'POST',
                        headers: {'HX-Request': 'true', 'HX-Current-URL': location.href},
                        body: form,
                        redirect: 'manual',
                        signal: controller.signal
                    });
                    const redirect = response.headers.get('hx-redirect') || response.headers.get('location');
                    return {
                        ok: response.ok || Boolean(redirect),
                        status: response.status,
                        value: redirect || (await response.text()).slice(0, 262144)
                    };
                } finally {
                    clearTimeout(timeout);
                }
            }, endpointUrl.href);
            checkAbort(signal);
            if (!result.ok) throw new AppError('PROVIDER_HTTP', `The file host rejected the download action (HTTP ${result.status}). Check verification and link availability.`, {status: 502});
            const matches = String(result.value).match(/https:\/\/dl\.fuckingfast\.co\/dl\/[^\s"'<>]+/g) || [];
            const direct = matches.find(candidate => {
                try {
                    return new URL(publicUrl(candidate)).hostname === 'dl.fuckingfast.co';
                } catch {
                    return false;
                }
            });
            if (!direct) throw new AppError('DIRECT_LINK_MISSING', 'No supported direct download link was returned. The file may be unavailable or the site may have changed.');
            return publicUrl(direct.replace(/&amp;/g, '&'));
        });
    }

    close() {
        return this.browser.close();
    }
}
