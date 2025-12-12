import { checkAuth } from "../utils/auth.js";
import { fetchWithHeaders, fetchWithRetry } from "../utils/fetcher.js";
import { decodeText } from "../utils/helpers.js";

export async function handleProxyRequest(path, request, env) {
    const url = new URL(request.url);

    // --- Visual Proxy ---
    if (path === '/api/visual-proxy') {
        const targetUrl = url.searchParams.get('url');
        const enableJs = url.searchParams.get('enable_js') === 'true';
        if (!targetUrl) return new Response("Missing url", { status: 400 });

        try {
            // Use fetchWithRetry to leverage domain mirrors when available
            const domainConfig = env.RSS_KV ? await env.RSS_KV.get('domain_config', { type: 'json' }) : null;
            const targetResp = await fetchWithRetry(targetUrl, {
                redirect: 'follow'
            }, domainConfig?.groups || []);

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
            // Normalize any existing charset meta tags in the HTML to UTF-8
            try {
                // Replace <meta charset=...> and <meta http-equiv="Content-Type" ...> occurrences
                html = html.replace(/<meta[^>]*charset=["']?[^"'\s>]+["']?[^>]*>/ig, '<meta charset="utf-8">');
                html = html.replace(/<meta[^>]*http-equiv=["']?content-type["']?[^>]*>/ig, '<meta charset="utf-8">');
            } catch (e) {
                // ignore replacement errors
            }
            const proxyBase = new URL(request.url).origin + '/api/visual-proxy?url=';
            const snifferScript = enableJs ? `
            <script>
            (function() {
                try {
                    const SITE_BASE = ${JSON.stringify(targetUrl)};
                    const PROXY_BASE = "/api/proxy?url=";

                    const resolve = (u) => {
                         try { return new URL(u, SITE_BASE).href; } catch(e) { return u; }
                    };

                    const send = (url, method, type) => {
                        window.parent.postMessage({
                            type: 'ajax-sniff', 
                            payload: { url, method, type, timestamp: Date.now() }
                        }, '*');
                    };

                    const originalFetch = window.fetch;
                    window.fetch = function(input, init) {
                        let url, method;
                        if (input instanceof Request) {
                            url = input.url;
                            method = input.method;
                        } else {
                            url = input;
                            method = (init && init.method) ? init.method : 'GET';
                        }
                        
                        const fullUrl = resolve(url);
                        send(fullUrl, method, 'fetch');
                        
                        if (fullUrl.includes('/api/proxy') || fullUrl.startsWith('data:')) {
                            return originalFetch.apply(this, arguments);
                        }

                        const proxiedUrl = PROXY_BASE + encodeURIComponent(fullUrl);
                        
                        if (input instanceof Request) {
                            return originalFetch(new Request(proxiedUrl, input), init);
                        }
                        return originalFetch(proxiedUrl, init);
                    };

                    const originalOpen = XMLHttpRequest.prototype.open;
                    XMLHttpRequest.prototype.open = function(method, url) {
                        const fullUrl = resolve(url);
                        send(fullUrl, method, 'xhr');
                        
                        if (fullUrl.includes('/api/proxy') || fullUrl.startsWith('data:')) {
                            return originalOpen.apply(this, arguments);
                        }

                        const proxiedUrl = PROXY_BASE + encodeURIComponent(fullUrl);
                        return originalOpen.call(this, method, proxiedUrl);
                    };

                    // 3. Dynamic Script Sniffing (JSONP / Dynamic Import)
                    try {
                        const scriptDesc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
                        if (scriptDesc && scriptDesc.set) {
                            Object.defineProperty(HTMLScriptElement.prototype, 'src', {
                                set: function(val) {
                                    const fullUrl = resolve(val);
                                    send(fullUrl, 'GET', 'script');
                                    
                                    if (!fullUrl.includes('/api/proxy') && !fullUrl.startsWith('data:')) {
                                        val = PROXY_BASE + encodeURIComponent(fullUrl);
                                    }
                                    scriptDesc.set.call(this, val);
                                },
                                get: function() {
                                    return scriptDesc.get.call(this);
                                }
                            });
                        }
                    } catch(e) { console.warn('Script hook failed', e); }

                    console.log('AJAX Sniffer & CORS Bypass Loaded (Advanced)');
                } catch(e) { console.error('Sniffer Error:', e); }
            })();
            </script>` : '';

            // Only remove scripts if JS is NOT enabled
            if (!enableJs) {
                html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
                html = html.replace(/\bon\w+="[^"]*"/gi, ""); // Remove inline event handlers
            }

            // Rewrite URLs (src, href) to go through proxy
            // This ensures CSS, Images, and Links work without CORS issues
            html = html.replace(/\b(src|href)\s*=\s*(["'])(.*?)\2/gi, (match, attr, quote, val) => {
                if (val.startsWith('data:') || val.startsWith('#') || val.startsWith('javascript:')) return match;
                try {
                    const absolute = new URL(val, targetUrl).href;
                    return `${attr}=${quote}${proxyBase}${encodeURIComponent(absolute)}${requestedEncoding ? '&encoding=' + encodeURIComponent(requestedEncoding) : ''}${quote}`;
                } catch (e) {
                    return match;
                }
            });

            // Inject Helper Script & Styles
            const helperScript = `
            <style>
                .rss-worker-hover { outline: 2px dashed #007bff !important; cursor: crosshair !important; z-index: 99999; position: relative; }
                .rss-worker-selected { outline: 2px solid red !important; z-index: 99999; position: relative; }
                .rss-worker-selected::after { content: '已选'; position: absolute; top: 0; left: 0; background: red; color: white; font-size: 10px; padding: 2px; }
            </style>
            <script>
            (function() {
                let mode = 'none'; // 'item', 'title', 'link', ...
                let currentItemSelector = ''; // stored from parent
                let selection = {
                    original: null, // the element actually clicked
                    current: null,  // the element currently selected (possibly ancestor)
                    depth: 0        // distance from original
                };

                // Init styles
                const style = document.createElement('style');
                style.innerHTML = \`
                    .rss-worker-hover { outline: 2px dashed #007bff !important; cursor: crosshair !important; z-index: 999999; }
                    .rss-worker-selected { outline: 3px solid #f97316 !important; z-index: 999999; position: relative; box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.5) !important; }
                    .rss-worker-selected::after { 
                        content: '已选中'; position: absolute; top: -20px; left: 0; 
                        background: #f97316; color: white; font-size: 10px; padding: 1px 4px; 
                        border-radius: 2px;
                        pointer-events: none;
                        white-space: nowrap;
                        z-index: 1000000;
                    }
                \`;
                document.head.appendChild(style);

                window.addEventListener('message', (e) => {
                    const { type } = e.data;
                    if (type === 'setMode') {
                        mode = e.data.mode;
                        currentItemSelector = e.data.itemSelector || '';
                        clearHighlights();
                        selection = { original: null, current: null, depth: 0 };
                    } 
                    else if (type === 'setDepth') {
                        if (selection.original) {
                            changeDepth(e.data.depth);
                        }
                    }
                });

                document.addEventListener('mouseover', (e) => {
                    if (mode === 'none') return;
                    e.stopPropagation();
                    e.target.classList.add('rss-worker-hover');
                }, true);

                document.addEventListener('mouseout', (e) => {
                    e.target.classList.remove('rss-worker-hover');
                }, true);

                document.addEventListener('click', (e) => {
                    if (mode === 'none') return;
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // New Selection
                    selection.original = e.target;
                    selection.depth = 0;
                    updateSelection(e.target);
                }, true);

                function clearHighlights() {
                    document.querySelectorAll('.rss-worker-selected').forEach(el => el.classList.remove('rss-worker-selected'));
                }

                function changeDepth(newDepth) {
                    if (!selection.original) return;
                    
                    let target = selection.original;
                    // Walk up newly requested depth
                    for (let i = 0; i < newDepth; i++) {
                        if (target.parentElement && target.parentElement !== document.body && target.parentElement !== document.documentElement) {
                            target = target.parentElement;
                        }
                    }
                    
                    selection.depth = newDepth;
                    updateSelection(target);
                }

                function updateSelection(el) {
                    selection.current = el;
                    clearHighlights();
                    el.classList.add('rss-worker-selected');
                    
                    // Generate Selector based on user's manual choice
                    const result = generateSelector(el, mode);
                    
                    window.parent.postMessage({ 
                        type: 'selected', 
                        mode: mode, 
                        selector: result.selector, 
                        depth: selection.depth
                    }, '*');
                    
                    // Optional: Highlight other matches if in Item mode to show what else matches
                    if (mode === 'item' && result.selector) {
                        try {
                            const others = document.querySelectorAll(result.selector);
                            others.forEach(o => {
                                if (o !== el) o.classList.add('rss-worker-selected'); 
                            });
                        } catch(e) {}
                    }
                }

                // --- Core Selector Logic ---
                function generateSelector(el, currentMode) {
                    // 1. ITEM MODE: We want a generic selector that matches this element AND its siblings (list items)
                    if (currentMode === 'item') {
                        return generateItemSelector(el);
                    } 
                    // 2. FIELD MODE: We want a relative selector from the closest Item to this element
                    else {
                        if (!currentItemSelector) {
                            // Fallback: just return global selector if no item selector yet
                            return { selector: generateGlobalSelector(el) };
                        }
                        
                        // Find closest item container
                        let itemContainer = null;
                        try {
                            // Try to match the configured item selector
                            const items = document.querySelectorAll(currentItemSelector);
                            for (let item of items) {
                                if (item.contains(el)) {
                                    itemContainer = item;
                                    break;
                                }
                            }
                        } catch(e) {}
                        
                        if (!itemContainer) {
                            // If not inside an item, fallback to global or warn
                            // For now, just global
                            return { selector: generateGlobalSelector(el) };
                        }
                        
                        // Generate relative path from itemContainer to el
                        return generateRelativeSelector(itemContainer, el);
                    }
                }

                function generateItemSelector(el) {
                    const tag = el.tagName.toLowerCase();
                    const classes = Array.from(el.classList).filter(c => !c.startsWith('rss-worker-'));
                    
                    // Strategy 1: Tag + Class
                    if (classes.length > 0) {
                        if (el.parentElement) {
                            const siblings = Array.from(el.parentElement.children);
                            for (let cls of classes) {
                                const count = siblings.filter(s => s.classList.contains(cls)).length;
                                if (count > 1) {
                                    return { selector: \`.\${cls}\` }; 
                                }
                            }
                        }
                        return { selector: \`\${tag}.\${classes[0]}\` };
                    }
                    
                    // Strategy 2: Just Tag 
                    return { selector: tag };
                }
                
                function generateGlobalSelector(el) {
                    const tag = el.tagName.toLowerCase();
                    const classes = Array.from(el.classList).filter(c => !c.startsWith('rss-worker-'));
                    if (classes.length > 0) return \`\${tag}.\${classes[0]}\`;
                    if (el.id) return \`#\${el.id}\`;
                    return tag;
                }

                function generateRelativeSelector(root, target) {
                    if (root === target) return { selector: '.' };
                    
                    let curr = target;
                    const path = [];
                    
                    while (curr && curr !== root) {
                        const tag = curr.tagName.toLowerCase();
                        const classes = Array.from(curr.classList).filter(c => !c.startsWith('rss-worker-'));
                        
                        if (classes.length > 0) {
                            path.unshift(\`.\${classes[0]}\`);
                        } else {
                            path.unshift(tag);
                        }
                        curr = curr.parentElement;
                    }
                    
                    return { selector: path.join(' ') };
                }
            })();
            </script>
            `;

            // Inject Sniffer Script EARLY (Head) if enabled
            if (enableJs && snifferScript) {
                if (html.includes('<head>')) {
                    html = html.replace('<head>', () => '<head>' + snifferScript);
                } else {
                    html = snifferScript + html;
                }
            }

            // Inject Helper Script (Visual Selector) ONLY if JS is disabled (Normal Preview Mode)
            if (!enableJs) {
                if (html.includes('</body>')) {
                    html = html.replace('</body>', () => `${helperScript}</body> `);
                } else {
                    html += helperScript;
                }
            }

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
            const msg = e && e.message ? e.message : String(e);
            return new Response(JSON.stringify({ error: 'Proxy Error', message: msg }), { status: 502, headers: { 'Content-Type': 'application/json' } });
        }
    }

    // --- Generic Proxy for JSON/Raw Data ---
    if (path === '/api/proxy') {
        const targetUrl = url.searchParams.get('url');
        if (!targetUrl) return new Response("Missing url", { status: 400 });

        // Check auth
        if (!checkAuth(request, env)) {
            return new Response('Unauthorized', { status: 401 });
        }

        try {
            const targetResp = await fetchWithHeaders(targetUrl);
            const body = await targetResp.text();
            return new Response(body, {
                headers: {
                    'Content-Type': targetResp.headers.get('content-type') || 'text/plain',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        } catch (e) {
            return new Response("Proxy Error: " + e.message, { status: 500 });
        }
    }

    return null; // Not handled
}
