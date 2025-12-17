import * as cheerio from 'cheerio';
import { checkAuth } from "../utils/auth.js";
import { fetchWithHeaders, fetchWithRetry } from "../utils/fetcher.js";
import { decodeText } from "../utils/helpers.js";
import { fixLazyImages, cleanHtml, rewriteUrlsForProxy } from "../utils/html.js";

export async function handleProxyRequest(path, request, env) {
    const url = new URL(request.url);

    // --- Visual Proxy ---

    if (path === '/api/visual-proxy') {
        const targetUrl = url.searchParams.get('url');
        const usePuppeteer = url.searchParams.get('use_puppeteer') === 'true';
        const waitSelector = url.searchParams.get('wait');

        if (!targetUrl) return new Response("Missing url", { status: 400 });

        try {
            // Use fetchWithRetry to leverage domain mirrors when available
            const domainConfig = env.RSS_KV ? await env.RSS_KV.get('domain_config', { type: 'json' }) : null;
            const fetchOptions = {
                redirect: 'follow',
                usePuppeteer: usePuppeteer,
                puppeteerProxyUrl: domainConfig?.puppeteerUrl,
                puppeteerWaitSelector: waitSelector
            };

            // Auto-migrate legacy Browserless URLs if detected
            if (fetchOptions.puppeteerProxyUrl && fetchOptions.puppeteerProxyUrl.includes('chrome.browserless.io')) {
                const oldUrl = fetchOptions.puppeteerProxyUrl;
                // Prefer LON (London) as a safe default, or SFO.
                fetchOptions.puppeteerProxyUrl = fetchOptions.puppeteerProxyUrl.replace('chrome.browserless.io', 'production-lon.browserless.io');
                console.warn(`[Visual Proxy] Auto-migrated legacy URL: ${oldUrl} -> ${fetchOptions.puppeteerProxyUrl}`);
            }

            // --- Diagnostic Logging ---
            console.log(`[Visual Proxy] usePuppeteer: ${usePuppeteer}`);
            console.log(`[Visual Proxy] puppeteerProxyUrl: ${fetchOptions.puppeteerProxyUrl}`);
            console.log(`[Visual Proxy] waitSelector: ${waitSelector}`);
            // --- End Diagnostics ---

            const targetResp = await fetchWithRetry(targetUrl, fetchOptions, domainConfig?.groups || []);

            // 1. Handle Non-HTML Resources (Images, CSS, Fonts, etc.)
            const contentType = targetResp.headers.get('Content-Type') || '';
            if (!contentType.includes('text/html')) {
                const newHeaders = new Headers(targetResp.headers);
                newHeaders.set('Access-Control-Allow-Origin', '*'); // Allow CORS for resources
                return new Response(targetResp.body, {
                    status: targetResp.status,
                    headers: newHeaders
                });
            }

            // 2. Handle HTML
            // Accept optional `encoding` query param from caller and pass to decoder
            const requestedEncoding = url.searchParams.get('encoding') || undefined;
            // Use decodeText to honor Content-Type header / meta charset / sniffing or forced encoding
            let html = await decodeText(targetResp, requestedEncoding);

            // Robust HTML Processing with Cheerio
            try {
                const $ = cheerio.load(html);

                // 1. Clean unwanted elements (scripts, ads, etc.) - Safer and more thorough than regex
                cleanHtml($);

                // 2. Fix lazy images (so they show up in preview)
                fixLazyImages($);

                // 3. Force UTF-8 meta
                $('meta[charset]').attr('charset', 'utf-8');
                $('meta[http-equiv="Content-Type"]').remove(); // Remove old content-type meta to avoid conflicts
                if ($('head').length) {
                    $('head').prepend('<meta charset="utf-8">');
                }

                // 4. Rewrite URLs to route through proxy
                const proxyBase = new URL(request.url).origin + '/api/visual-proxy?url=';
                rewriteUrlsForProxy($, targetUrl, proxyBase, requestedEncoding);

                // 5. Remove Inline Events (onX attributes) - Security
                $('*').each((_, el) => {
                    const attribs = el.attribs;
                    for (const name in attribs) {
                        if (name.startsWith('on')) {
                            $(el).removeAttr(name);
                        }
                    }
                });

                html = $.html();
            } catch (e) {
                console.error('[Visual Proxy] Cheerio processing failed:', e);
                // Fallback: If Cheerio fails, return original HTML (with basic regex cleaning as worst-case fallback)
                // But Cheerio rarely fails on full docs.
                html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
            }

            // Inject Visual Selector Helper Script (Server-Side Injection)
            // Advanced Version: Includes Smart List Detection
            const selectorHelperScript = `
            <script>
            (function() {
                // Wait for DOM
                window.addEventListener('DOMContentLoaded', initSelector);
                window.addEventListener('load', initSelector);
                
                let initialized = false;
                function initSelector() {
                    if (initialized) return;
                    initialized = true;
                    console.log('[Proxy] Smart Visual Selector Loaded');

                    // Styles for highlighting
                    const style = document.createElement('style');
                    style.textContent = \`
                        .rss-worker-hover { 
                            outline: 3px dashed #3b82f6 !important; 
                            outline-offset: -3px;
                            background-color: rgba(59, 130, 246, 0.1) !important;
                            cursor: crosshair !important; 
                            z-index: 999999; 
                        }
                        .rss-worker-selected { 
                            outline: 3px solid #ef4444 !important; 
                            background-color: rgba(239, 68, 68, 0.2) !important;
                            z-index: 999999; 
                        }
                        #rss-worker-overlay {
                            position: fixed; top: 10px; right: 10px; z-index: 9999999;
                            background: #333; color: white; padding: 5px 10px;
                            border-radius: 4px; font-size: 12px; font-family: sans-serif;
                            pointer-events: none; opacity: 0.8; display: none;
                        }
                    \`;
                    document.head.appendChild(style);

                    const overlayInfo = document.createElement('div');
                    overlayInfo.id = 'rss-worker-overlay';
                    document.body.appendChild(overlayInfo);

                    let currentMode = 'item'; // Default

                    window.addEventListener('message', (e) => {
                        if (e.data && e.data.type === 'setMode') {
                            currentMode = e.data.mode;
                            console.log('[Proxy] Mode set to:', currentMode);
                            showToast('模式切换: ' + (currentMode === 'item' ? '选择列表项 (自动识别)' : '选择 ' + currentMode));
                        }
                    });

                    function showToast(text) {
                        overlayInfo.textContent = text;
                        overlayInfo.style.display = 'block';
                        setTimeout(() => overlayInfo.style.display = 'none', 2000);
                    }

                    // --- Smart Selector Logic ---

                    function getSimpleClassSelector(el) {
                         if (!el) return '';
                         const cls = Array.from(el.classList)
                            .filter(c => !c.startsWith('rss-worker-') && !c.includes('active') && !c.includes('hover'))
                            .join('.');
                         return cls ? '.' + cls : '';
                    }

                    // Check if element is likely a list item (has siblings with similar structure)
                    function isRepeatingElement(el) {
                        if (!el || !el.parentElement) return false;
                        if (el.tagName === 'BODY' || el.tagName === 'HTML') return false;
                        
                        const tag = el.tagName;
                        const cls = getSimpleClassSelector(el);
                        
                        // Count siblings with same tag and (optionally) class
                        let siblings = el.parentElement.children;
                        let count = 0;
                        for (let sib of siblings) {
                            if (sib === el) continue;
                            if (sib.tagName === tag) {
                                if (!cls || getSimpleClassSelector(sib) === cls) {
                                    count++;
                                }
                            }
                        }
                        // If it has at least one similar sibling, it's a candidate
                        return count > 0;
                    }

                    // Find the best "List Item" candidate by walking up from the clicked target
                    function findSmartListItem(target) {
                        let candidate = target;
                        // Walk up max 5 levels
                        for (let i = 0; i < 5; i++) {
                            if (isRepeatingElement(candidate)) {
                                return candidate; // Found a repeating element!
                            }
                            if (candidate.parentElement) candidate = candidate.parentElement;
                            else break;
                        }
                        return target; // Fallback to original click if no repeater found
                    }

                    function generateSelector(el, mode) {
                        if (!el) return '';
                         // 1. If Item Mode: Bias towards class names of repeating elements
                        if (mode === 'item') {
                            const cls = getSimpleClassSelector(el);
                            if (cls) {
                                // Verify uniqueness? No, for items we WANT multiple matches.
                                // But check if it matches TOO much (like 'div')?
                                // If class exists, use it.
                                return el.tagName.toLowerCase() + cls;
                            }
                        }
                        
                        // 2. Generic ID fallback
                        if (el.id) return '#' + el.id;

                        // 3. Fallback to Tag + Class
                        const cls = getSimpleClassSelector(el);
                        if (cls) return el.tagName.toLowerCase() + cls;

                        // 4. Worst case: Tag only (risky) or nth-child path?
                        // Let's keep it simple for now, maybe add parent context
                        if (el.parentElement && el.parentElement.id) {
                            return '#' + el.parentElement.id + ' > ' + el.tagName.toLowerCase();
                        }
                        
                        return el.tagName.toLowerCase();
                    }

                    // Mouse interactions
                    let lastHovered = null;

                    document.body.addEventListener('mouseover', (e) => {
                        e.stopPropagation();
                        // Remove highlight from previous
                        if (lastHovered) lastHovered.classList.remove('rss-worker-hover');
                        
                        let target = e.target;
                        if (target.tagName === 'HTML') return;

                        // In ITEM mode, preview the smart selection (the repeating parent)
                        if (currentMode === 'item') {
                            target = findSmartListItem(target);
                        }

                        target.classList.add('rss-worker-hover');
                        lastHovered = target;
                    });
                    
                    document.body.addEventListener('mouseout', (e) => {
                        e.stopPropagation();
                         if (lastHovered) {
                            lastHovered.classList.remove('rss-worker-hover');
                            lastHovered = null;
                        }
                    });
                    
                    document.body.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        let target = e.target;
                        
                        // SMART LOGIC:
                        if (currentMode === 'item') {
                            // Find nearest repeating parent
                            target = findSmartListItem(target);
                        }

                        // Flash effect
                        target.classList.add('rss-worker-selected');
                        setTimeout(() => target.classList.remove('rss-worker-selected'), 500);

                        // Generate selector
                        const selector = generateSelector(target, currentMode);
                        
                        console.log('[Proxy] Selected:', selector);
                        showToast('已选择: ' + selector);

                        // Notify parent
                        window.parent.postMessage({
                            type: 'selected',
                            mode: currentMode,
                            selector: selector
                        }, '*');

                        return false;
                    }, true);
                }
            })();
            </script>
            `;

            // Append to body
            if (html.includes('</body>')) {
                html = html.replace('</body>', selectorHelperScript + '</body>');
            } else {
                html += selectorHelperScript;
            }

            const baseUrl = new URL(targetUrl);
            const baseTag = `<base href="${baseUrl.origin}${baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1)}">`;
            // Remove existing base tag first to avoid duplicates
            html = html.replace(/<base[^>]*>/i, '');
            // Inject new base tag after head
            html = html.replace('<head>', `<head>${baseTag}`);

            // Strip restrictive headers
            const newHeaders = new Headers(targetResp.headers);
            newHeaders.delete('Content-Security-Policy');
            newHeaders.delete('X-Frame-Options');
            newHeaders.delete('X-Content-Type-Options');
            newHeaders.set('Content-Type', 'text/html; charset=utf-8');

            return new Response(html, {
                status: targetResp.status,
                headers: newHeaders
            });
        } catch (e) {
            console.error('[Visual Proxy] Global Error:', e);
            const msg = e && e.message ? e.message : String(e);

            // Return visual error page
            const errorHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8"><title>Proxy Error</title>
                <style>
                    body{font-family:-apple-system,sans-serif;padding:2rem;color:#333;background:#fff5f5}
                    .error-box{background:white;border:1px solid #fc8181;border-radius:8px;padding:2rem;box-shadow:0 4px 6px rgba(0,0,0,0.05);max-width:800px;margin:0 auto}
                    h2{color:#c53030;margin-top:0;border-bottom:1px solid #eee;padding-bottom:1rem}
                    pre{background:#f7fafc;padding:1rem;border-radius:6px;overflow-x:auto;font-size:0.9em;border:1px solid #e2e8f0}
                    .info{margin-top:1.5rem;padding:1rem;background:#ebf8ff;border-radius:6px;color:#2c5282;font-size:0.95em}
                </style>
            </head>
            <body>
                <div class="error-box">
                    <h2>⚠️ 预览服务错误</h2>
                    <p>无法加载目标网页，可能是配置问题或网络拦截。</p>
                    <div style="margin-bottom:1rem">
                        <strong>错误信息：</strong>
                        <pre>${msg}</pre>
                        ${e.stack ? `<details><summary style="cursor:pointer;color:#718096;font-size:0.8em">查看调用栈</summary><pre style="margin-top:0.5rem;font-size:0.8em">${e.stack}</pre></details>` : '<!-- no stack -->'}
                    </div>
                    <div class="info">
                        <strong>排查建议：</strong>
                        <ul style="margin:0.5rem 0 0 1.2rem">
                            <li>如果是 <strong>Puppeteer</strong> 模式，请检查 API Key 是否正确填写并已保存。</li>
                            <li>目标网站可能屏蔽了 Cloudflare IP 或 headless 浏览器。</li>
                            <li>尝试在 "域名配置" 中使用 "Test Saved Config" 功能验证配置。</li>
                            <li>检查 URL 是否拼写正确且可公开访问。</li>
                        </ul>
                    </div>
                </div>
            </body>
            </html>
            `;

            return new Response(errorHtml, {
                status: 502,
                headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
        }
    }

    // --- Generic Proxy for JSON/Raw Data ---
    if (path === '/api/proxy') {
        const targetUrl = url.searchParams.get('url');
        if (!targetUrl) return new Response("Missing url", { status: 400 });

        // Check auth
        if (!checkAuth(request, env)) {
            return new Response("Unauthorized", { status: 401 });
        }

        try {
            // NOTE: Generic proxy handles data URLs and internal requests in frontend usually,
            // but we support fetching here too.
            const resp = await fetchWithHeaders(targetUrl);
            const newHeaders = new Headers(resp.headers);
            newHeaders.set('Access-Control-Allow-Origin', '*');

            return new Response(resp.body, {
                status: resp.status,
                headers: newHeaders
            });
        } catch (e) {
            return new Response("Proxy failed: " + e.message, { status: 502 });
        }
    }

    return null;
}
