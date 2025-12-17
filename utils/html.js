/**
 * HTML Processing Utilities
 * Common functions for handling HTML content, lazy images, etc.
 */

/**
 * Fix lazy-loaded images by replacing placeholder src with actual image URLs from data-* attributes
 * @param {cheerio.CheerioAPI} $ - Cheerio instance
 * @param {string|null} context - Optional CSS selector to limit scope
 */
export function fixLazyImages($, context = null) {
    const imgs = context ? $(context).find('img') : $('img');

    imgs.each((_, img) => {
        const $img = $(img);
        const currentSrc = $img.attr('src') || '';

        // Skip if already has valid src (not placeholder)
        if (currentSrc &&
            !currentSrc.startsWith('data:') &&
            !currentSrc.includes('placeholder') &&
            !currentSrc.includes('loading') &&
            !currentSrc.includes('spacer') &&
            !currentSrc.includes('blank') &&
            currentSrc.startsWith('http')) {
            return;
        }

        // List of common lazy-load attributes (ordered by priority)
        const lazyAttrs = [
            'data-src',
            'data-original',
            'data-url',
            'data-image',
            'data-lazy-src',
            'data-lazy',
            'data-lazysrc',
            'data-original-src',
            'data-echo',
            'data-actualsrc',
            'data-real-src',
            'data-img-src',
            'data-defer-src',
            'data-hi-res-src'
        ];

        // Try each lazy attribute
        for (const attr of lazyAttrs) {
            const val = $img.attr(attr);
            if (val && (val.startsWith('http') || val.startsWith('//'))) {
                const finalUrl = val.startsWith('//') ? 'https:' + val : val;
                $img.attr('src', finalUrl);
                // Also fix srcset if present
                const dataSrcset = $img.attr('data-srcset');
                if (dataSrcset) $img.attr('srcset', dataSrcset);
                return;
            }
        }

        // Try srcset or data-srcset as fallback
        const srcset = $img.attr('srcset') || $img.attr('data-srcset');
        if (srcset) {
            const match = srcset.match(/(https?:\/\/[^\s,]+)/);
            if (match) {
                $img.attr('src', match[1]);
                return;
            }
        }

        // Try noscript fallback (some sites put real img in noscript for SEO)
        const noscript = $img.parent().next('noscript');
        if (noscript.length) {
            const noscriptImg = noscript.html();
            if (noscriptImg) {
                const srcMatch = noscriptImg.match(/src=["']([^"']+)["']/);
                if (srcMatch && srcMatch[1]) {
                    $img.attr('src', srcMatch[1]);
                }
            }
        }
    });
}

/**
 * Fix relative URLs to absolute URLs
 * @param {cheerio.CheerioAPI} $ - Cheerio instance 
 * @param {string} baseUrl - Base URL for resolution
 */
export function fixRelativeUrls($, baseUrl) {
    if (!baseUrl) return;

    try {
        const base = new URL(baseUrl);

        // Fix href attributes
        $('a[href]').each((_, el) => {
            const href = $(el).attr('href');
            if (href && !href.startsWith('http') && !href.startsWith('javascript:') && !href.startsWith('#') && !href.startsWith('mailto:')) {
                try {
                    $(el).attr('href', new URL(href, base).href);
                } catch (e) { }
            }
        });

        // Fix src attributes 
        $('[src]').each((_, el) => {
            const src = $(el).attr('src');
            if (src && !src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('//')) {
                try {
                    $(el).attr('src', new URL(src, base).href);
                } catch (e) { }
            }
        });

        // Fix srcset
        $('[srcset]').each((_, el) => {
            const srcset = $(el).attr('srcset');
            if (srcset) {
                const fixed = srcset.split(',').map(part => {
                    const [url, size] = part.trim().split(/\s+/);
                    if (url && !url.startsWith('http')) {
                        try {
                            const absUrl = new URL(url, base).href;
                            return size ? `${absUrl} ${size}` : absUrl;
                        } catch (e) {
                            return part;
                        }
                    }
                    return part;
                }).join(', ');
                $(el).attr('srcset', fixed);
            }
        });
    } catch (e) {
        console.warn('[fixRelativeUrls] Invalid base URL:', baseUrl, e.message);
    }
}

/**
 * Clean HTML by removing script, style, and other unwanted elements
 * @param {cheerio.CheerioAPI} $ - Cheerio instance
 */
export function cleanHtml($) {
    // Remove scripts and styles
    $('script, style, noscript, iframe[src*="ads"], ins.adsbygoogle').remove();

    // Unhide hidden elements (don't remove them, just make them visible)
    // This fixes issues where sites hide body/content with inline styles waiting for JS
    $('[style*="display:none"], [style*="display: none"]').each((_, el) => {
        const style = $(el).attr('style');
        if (style) {
            // naive removal of display:none, safe enough for preview
            $(el).attr('style', style.replace(/display:\s*none;?/gi, ''));
        }
    });
    $('[hidden]').removeAttr('hidden');

    // Remove common ad/tracking elements
    $('[class*="advertisement"], [class*="sponsored"], [id*="google_ads"]').remove();

    // --- Custom Cleanups ---

    // Telegram: Unwrap tg-emoji tags (keep the inner emoji char)
    $('tg-emoji').each((_, el) => {
        const $el = $(el);
        // Usually contains <span class="emoji">📱</span> or just text
        // We just want to unwrap it, or replace with text if structure is known
        $el.replaceWith($el.html());
    });

    // Telegram: Remove tg-specific attributes if needed, but unwrapping tg-emoji is most important.
    // Clean specific classes that might cause issues?
    $('.tgme_widget_message_user_photo, .tgme_widget_message_info').remove();
}

/**
 * Extract and fix images from a content element
 * Returns the modified HTML with fixed image sources
 * @param {cheerio.CheerioAPI} $ - Cheerio instance
 * @param {string} selector - CSS selector for content container
 * @param {string} baseUrl - Base URL for relative URLs
 * @returns {string} Fixed HTML content
 */
export function extractContent($, selector, baseUrl = '') {
    const contentEl = $(selector);
    if (contentEl.length === 0) return '';

    // Fix lazy images within content
    fixLazyImages($, selector);

    // Fix relative URLs
    if (baseUrl) {
        try {
            const base = new URL(baseUrl);
            contentEl.find('img[src]').each((_, img) => {
                const src = $(img).attr('src');
                if (src && !src.startsWith('http') && !src.startsWith('data:')) {
                    try {
                        $(img).attr('src', new URL(src, base).href);
                    } catch (e) { }
                }
            });
            contentEl.find('a[href]').each((_, a) => {
                const href = $(a).attr('href');
                if (href && !href.startsWith('http') && !href.startsWith('#') && !href.startsWith('mailto:')) {
                    try {
                        $(a).attr('href', new URL(href, base).href);
                    } catch (e) { }
                }
            });
        } catch (e) { }
    }

    return contentEl.html() || '';
}

/**
 * Rewrite URLs to go through the visual proxy
 * @param {cheerio.CheerioAPI} $ - Cheerio instance
 * @param {string} targetUrl - The original URL of the page (for resolving relative links)
 * @param {string} proxyBaseUrl - The base URL of the proxy (e.g. /api/visual-proxy?url=)
 * @param {string} [encoding] - Optional encoding param to pass through
 */
export function rewriteUrlsForProxy($, targetUrl, proxyBaseUrl, encoding) {
    const base = new URL(targetUrl);

    const processor = (tagName, attrName) => {
        $(tagName).each((_, el) => {
            const $el = $(el);
            const val = $el.attr(attrName);
            if (!val) return;

            // Skip data URIs, anchors, javascript
            if (val.startsWith('data:') || val.startsWith('#') || val.startsWith('javascript:')) return;

            try {
                // Resolve to absolute URL first
                const absolute = new URL(val, base).href;

                // Construct proxied URL
                let proxied = `${proxyBaseUrl}${encodeURIComponent(absolute)}`;
                if (encoding) proxied += `&encoding=${encodeURIComponent(encoding)}`;

                $el.attr(attrName, proxied);
            } catch (e) {
                // Keep original if resolution fails
            }
        });
    };

    processor('img', 'src');
    processor('link', 'href');
    processor('script', 'src'); // Though scripts are usually removed, if any remain
    processor('a', 'href'); // Rewrite links too? Yes, for navigation within preview.
    processor('iframe', 'src');
    processor('source', 'srcset'); // TODO: Handle srcset parsing properly? 
    // For now simple srcset handling might be too complex for simple proxy, 
    // but at least standard src/href are covered.
}

/**
 * Robustly unescape HTML entities
 * @param {string} str 
 * @returns {string}
 */
export function unescapeHtml(str) {
    if (!str) return '';

    let current = str;
    // Limit loops to avoid infinite recursion or excessive processing
    // 3 passes should handle double/triple escaping which is the most common worst case
    for (let i = 0; i < 3; i++) {
        if (!current.includes('&lt;') && !current.includes('&gt;') && !current.includes('&amp;')) {
            break;
        }

        const next = current
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&amp;/g, '&');

        if (next === current) break;
        current = next;
    }

    return current;
}
