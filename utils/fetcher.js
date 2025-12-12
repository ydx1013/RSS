
import { getCandidateUrls } from './domain.js';

/**
 * Enhanced fetch wrapper with browser-like headers to avoid anti-bot detection.
 * @param {string} url 
 * @param {object} options 
 * @returns {Promise<Response>}
 */
export async function fetchWithHeaders(url, options = {}) {
    const defaultHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'DNT': '1',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
    };
    // Merge base headers with any provided headers
    const baseHeaders = { ...defaultHeaders, ...(options.headers || {}) };

    // Prepare a set of header variants to try when a request is blocked by anti-bot
    // Order matters: prefer original headers first, then fallbacks.
    let originRef = '';
    try { originRef = new URL(url).origin; } catch (e) { originRef = ''; }

    const headerVariants = [
        // 1. Default (desktop Chrome-like)
        { ...baseHeaders },
        // 2. Edge-like desktop UA
        { ...baseHeaders, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0' },
        // 3. Mobile Safari UA with Referer set to origin (some sites allow mobile UA)
        { ...baseHeaders, 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1', 'Referer': originRef },
        // 4. Fallback: Googlebot (some sites intentionally permit crawlers)
        { ...baseHeaders, 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'Referer': originRef }
    ];

    // Puppeteer Proxy Logic
    if (options.usePuppeteer && options.puppeteerProxyUrl) {
        try {
            // Construct proxy URL: e.g. https://my-browserless.com/function?url=...
            const proxyUrl = new URL(options.puppeteerProxyUrl);
            proxyUrl.searchParams.append('url', url);
            // Optionally pass selector to wait for if needed
            if (options.puppeteerWaitSelector) {
                proxyUrl.searchParams.append('wait', options.puppeteerWaitSelector);
            }
            console.log(`[Fetch] Using Puppeteer Proxy: ${proxyUrl.toString()}`);

            // For proxy, we might not need all the browser headers, or we might want to pass them?
            // Usually proxy handles UA. Let's keep base headers but fetch the proxy URL.
            return fetch(proxyUrl.toString(), {
                method: options.method || 'GET',
                headers: {
                    ...baseHeaders,
                    // Add any specific auth headers for the proxy if needed (not implemented yet)
                }
            });
        } catch (e) {
            console.error('Puppeteer Proxy URL construction failed:', e);
            // Fallback to normal fetch? Or throw? Throwing is better as user explicitly asked for puppeteer.
            throw new Error('Puppeteer Proxy configuration error: ' + e.message);
        }
    }

    // Try each variant in sequence. If network error or anti-bot status (403/429/5xx), try next variant.
    const retryStatuses = new Set([403, 429, 503, 521, 522, 523, 524]);

    for (let i = 0; i < headerVariants.length; i++) {
        const headers = headerVariants[i];
        const newOptions = { ...options, headers };

        try {
            const res = await fetch(url, newOptions);

            // If successful or non-retryable status, return immediately
            if (res.ok) {
                return res;
            }

            // If status is not in retry list, return the response (e.g., 404)
            if (!retryStatuses.has(res.status)) {
                return res;
            }

            // Otherwise, record and try next variant after a small delay
            console.warn(`[fetchWithHeaders] Variant #${i} returned status ${res.status} for ${url}, trying next variant`);
        } catch (e) {
            console.warn(`[fetchWithHeaders] Variant #${i} network error for ${url}: ${e.message}`);
            // If last variant, rethrow
            if (i === headerVariants.length - 1) throw e;
        }

        // Backoff delay between attempts (increasing)
        const delayMs = 300 + i * 250;
        await new Promise(r => setTimeout(r, delayMs));
    }

    // As a final fallback, perform a plain fetch with original options (should rarely reach here)
    return fetch(url, options);
}

/**
 * Fetch with domain fallback retry logic
 * @param {string} url 
 * @param {object} options 
 * @param {string[][]} domainGroups Array of domain groups
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(url, options = {}, domainGroups = []) {
    const candidates = getCandidateUrls(url, domainGroups);

    if (candidates.length === 0) {
        return fetchWithHeaders(url, options);
    }

    let lastError;
    let lastResponse;
    const failures = [];

    for (let i = 0; i < candidates.length; i++) {
        const currentUrl = candidates[i];
        const isRetry = i > 0;

        if (isRetry) {
            console.log(`[Fetch] Retrying with mirror: ${currentUrl}`);
        }

        try {
            const res = await fetchWithHeaders(currentUrl, options);

            // Success
            if (res.ok) {
                // Attach the effective URL to the response object so we can track which mirror worked
                Object.defineProperty(res, 'effectiveRequestUrl', {
                    value: currentUrl,
                    writable: false
                });
                // Attach failures history
                Object.defineProperty(res, 'retryFailures', {
                    value: failures,
                    writable: false
                });
                return res;
            }

            lastResponse = res;

            // Record failure
            failures.push({ url: currentUrl, error: `HTTP ${res.status} ${res.statusText}` });

            console.log(`[Fetch] ${currentUrl} failed with ${res.status}`);
        } catch (e) {
            console.log(`[Fetch] ${currentUrl} failed with error: ${e.message}`);
            failures.push({ url: currentUrl, error: e.message });
            lastError = e;
        }
    }

    // If we have a response (even error status), return it
    if (lastResponse) {
        Object.defineProperty(lastResponse, 'retryFailures', {
            value: failures,
            writable: false
        });
        return lastResponse;
    }

    // Otherwise throw the last error
    const finalError = lastError || new Error(`All mirrors failed for ${url}`);
    finalError.retryFailures = failures;
    throw finalError;
}
