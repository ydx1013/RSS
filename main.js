import customRouter from "./routers/custom.js"
import telegramRouter from "./routers/telegram.js"
import jsonRouter from "./routers/json.js"
import feedRouter from "./routers/feed.js"
import { adminHtml } from "./admin_ui.js"
import { cacheConfig } from "./config.js"
import { checkAuth, generateToken } from "./utils/auth.js"
import { clearRouteCache } from "./utils/cache.js"
import { fetchWithHeaders, fetchWithRetry } from "./utils/fetcher.js"
import { decodeText } from "./utils/helpers.js"
import { sendBarkNotification } from "./utils/notify.js"

export default {
    async fetch(request, env, ctx) {

        console.log("UA:", request.headers.get("User-Agent") || "无UA")

        const url = new URL(request.url)
        const path = url.pathname

        // --- Admin Interface ---
        if (path === '/admin') {
            return new Response(adminHtml, {
                headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
        }

        // --- Admin Auth Endpoints ---
        if (path === '/admin/auth') {
            if (request.method === 'POST') {
                const body = await request.json();
                const token = generateToken(body.password, env);
                if (token) {
                    return new Response(JSON.stringify({ token }), {
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
                return new Response('Unauthorized', { status: 401 });
            }
        }

        // --- Bark Test Endpoint (Admin only) ---
        if (path === '/api/test-bark') {
            if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
            if (!checkAuth(request, env)) return new Response('Unauthorized', { status: 401 });

            try {
                const body = await request.json();
                const barkUrl = (body && body.barkUrl) ? body.barkUrl : null;

                // If not provided in body, try global domain config
                let target = barkUrl;
                if (!target && env.RSS_KV) {
                    const domainConfig = await env.RSS_KV.get('domain_config', { type: 'json' }) || {};
                    target = domainConfig.notifications?.barkUrl || null;
                }

                if (!target) return new Response(JSON.stringify({ ok: false, error: 'No Bark URL configured' }), { headers: { 'Content-Type': 'application/json' }, status: 400 });

                // Use sendBarkNotification if available
                try {
                    const { sendBarkNotification } = await import('./utils/notify.js');
                    const ok = await sendBarkNotification(target, 'Test Notification', 'This is a test notification from RSS Worker.', 'RSS-Test', '');
                    if (ok) {
                        return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
                    } else {
                        return new Response(JSON.stringify({ ok: false, error: 'Failed to deliver to Bark' }), { headers: { 'Content-Type': 'application/json' }, status: 502 });
                    }
                } catch (e) {
                    console.error('Test Bark error:', e);
                    return new Response(JSON.stringify({ ok: false, error: e.message }), { headers: { 'Content-Type': 'application/json' }, status: 500 });
                }

            } catch (e) {
                return new Response(JSON.stringify({ ok: false, error: e.message }), { headers: { 'Content-Type': 'application/json' }, status: 400 });
            }
        }

        if (path === '/admin/check') {
            const isAuth = checkAuth(request, env);
            if (isAuth) {
                return new Response('OK', { status: 200 });
            }
            return new Response('Unauthorized', { status: 401 });
        }

        // --- API for Domain Config ---
        if (path === '/api/domains') {
            if (!env.RSS_KV) {
                return new Response("KV Namespace 'RSS_KV' not bound.", { status: 500 });
            }

            if (request.method !== 'GET' && !checkAuth(request, env)) {
                return new Response('Unauthorized', { status: 401 });
            }

            if (request.method === 'GET') {
                const config = await env.RSS_KV.get('domain_config', { type: 'json' }) || { groups: [] };
                return new Response(JSON.stringify(config), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            if (request.method === 'POST') {
                const config = await request.json();
                await env.RSS_KV.put('domain_config', JSON.stringify(config));
                return new Response("Saved", { status: 200 });
            }
        }

        // --- API for KV Management ---
        if (path === '/api/routes') {
            if (!env.RSS_KV) {
                return new Response("KV Namespace 'RSS_KV' not bound.", { status: 500 });
            }

            // 检查认证（除了GET请求）
            if (request.method !== 'GET' && !checkAuth(request, env)) {
                return new Response('Unauthorized', { status: 401 });
            }

            if (request.method === 'GET') {
                const list = await env.RSS_KV.get('routes', { type: 'json' }) || {};
                const statuses = await env.RSS_KV.get('route_statuses', { type: 'json' }) || {};
                
                // Merge statuses into list
                for (const key in list) {
                    if (statuses[key]) {
                        list[key].status = statuses[key];
                    }
                }
                
                return new Response(JSON.stringify(list), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            if (request.method === 'POST') {
                const body = await request.json();
                const { key, config } = body;
                if (!key || !config) return new Response("Missing key or config", { status: 400 });

                const list = await env.RSS_KV.get('routes', { type: 'json' }) || {};
                // Add or update timestamp
                config.updatedAt = Date.now();
                list[key] = config;
                await env.RSS_KV.put('routes', JSON.stringify(list));
                
                // 清除该路由的所有格式缓存
                const origin = new URL(request.url).origin;
                await clearRouteCache(key, origin);
                
                return new Response("Saved", { status: 200 });
            }

            // Batch Update
            if (request.method === 'PUT') {
                const updates = await request.json(); // Expects { key1: config1, key2: config2 }
                const list = await env.RSS_KV.get('routes', { type: 'json' }) || {};
                
                let changed = false;
                const origin = new URL(request.url).origin;

                for (const [key, config] of Object.entries(updates)) {
                    if (config === null) {
                        delete list[key];
                    } else {
                        config.updatedAt = Date.now();
                        list[key] = config;
                    }
                    changed = true;
                    await clearRouteCache(key, origin);
                }
                
                if (changed) {
                    await env.RSS_KV.put('routes', JSON.stringify(list));
                }
                return new Response("Batch Saved", { status: 200 });
            }

            if (request.method === 'DELETE') {
                const key = url.searchParams.get('key');
                if (!key) return new Response("Missing key", { status: 400 });

                const list = await env.RSS_KV.get('routes', { type: 'json' }) || {};
                delete list[key];
                await env.RSS_KV.put('routes', JSON.stringify(list));
                
                // 清除该路由的所有格式缓存
                const origin = new URL(request.url).origin;
                await clearRouteCache(key, origin);
                
                return new Response("Deleted", { status: 200 });
            }
        }

        // --- API for Preview ---
        if (path === '/api/preview') {
            if (request.method !== 'POST') return new Response("Method not allowed", { status: 405 });
            const config = await request.json();
            
            // Load domain config
            if (env.RSS_KV) {
                const domainConfig = await env.RSS_KV.get('domain_config', { type: 'json' }) || { groups: [] };
                config.domainConfig = domainConfig;
            }
            
            const params = {
                param: 'preview',
                workerUrl: new URL(request.url).origin,
                format: 'json', // Use JSON format internally for preview if needed, but we want raw items
                maxItems: 5, // Limit preview items
            };

            try {
                let result;
                if (config.type === 'telegram') {
                    result = await telegramRouter(params, config);
                } else if (config.type === 'json') {
                    result = await jsonRouter(params, config);
                } else if (config.type === 'rss') {
                    result = await feedRouter(params, config);
                } else {
                    result = await customRouter(params, config);
                }
                // Ensure result is a string
                if (typeof result !== 'string') {
                    result = JSON.stringify(result);
                }
                return new Response(result, {
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (e) {
                return new Response(JSON.stringify({ isError: true, message: e.message }), {
                    headers: { 'Content-Type': 'application/json' },
                    status: 500
                });
            }
        }

        // --- Visual Proxy ---
        if (path === '/api/visual-proxy') {
            const targetUrl = url.searchParams.get('url');
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

                // Remove existing scripts to prevent execution errors and CORS issues from SPA logic
                // Use empty string instead of comment to avoid breaking nested comments (e.g. <!-- <script>...</script> -->)
                html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
                html = html.replace(/\bon\w+="[^"]*"/gi, ""); // Remove inline event handlers

                // Rewrite URLs (src, href) to go through proxy
                // This ensures CSS, Images, and Links work without CORS issues
                html = html.replace(/\b(src|href)\s*=\s*(["'])(.*?)\2/gi, (match, attr, quote, val) => {
                    if (val.startsWith('data:') || val.startsWith('#') || val.startsWith('javascript:')) return match;
                    try {
                        const absolute = new URL(val, targetUrl).href;
                        return `${attr}=${quote}${proxyBase}${encodeURIComponent(absolute)}${requestedEncoding ? '&encoding=' + encodeURIComponent(requestedEncoding) : ''}${quote}`;
                    } catch(e) {
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
                    let itemSelector = '';
                    let selectorType = 'html'; // 'html' or 'xpath'

                    window.addEventListener('message', (e) => {
                        if (e.data.type === 'setMode') {
                            mode = e.data.mode;
                            itemSelector = e.data.itemSelector || '';
                            selectorType = e.data.selectorType || 'html';
                            console.log('RSS Worker: Mode set to', mode, 'Type:', selectorType);
                            
                            // Clear previous highlights if switching to item mode
                            if (mode === 'item') {
                                document.querySelectorAll('.rss-worker-selected').forEach(el => el.classList.remove('rss-worker-selected'));
                            } else if (itemSelector) {
                                // Re-highlight items if we have a selector
                                try {
                                    if (selectorType === 'xpath') {
                                        const result = document.evaluate(itemSelector, document, null, 7, null);
                                        for(let i=0; i<result.snapshotLength; i++) {
                                            result.snapshotItem(i).classList.add('rss-worker-selected');
                                        }
                                    } else {
                                        document.querySelectorAll(itemSelector).forEach(el => el.classList.add('rss-worker-selected'));
                                    }
                                } catch(e) {}
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

                    // Improved selector generator
                    const getOptimalSelector = (el, root = document) => {
                        if (!el || el === root) return '';
                        
                        const classes = Array.from(el.classList).filter(c => !c.startsWith('rss-worker-'));
                        
                        if (classes.length > 0) {
                            return el.tagName.toLowerCase() + '.' + classes.join('.');
                        }
                        
                        return el.tagName.toLowerCase();
                    };

                    document.addEventListener('click', (e) => {
                        if (mode === 'none') return;
                        e.preventDefault();
                        e.stopPropagation();
                        
                        let target = e.target;
                        let selector = '';

                        if (selectorType === 'xpath') {
                             if (mode === 'item') {
                                 // Generate XPath for list
                                 let candidate = target;
                                 let bestXPath = '';
                                 
                                 // Try to find the list container level
                                 for(let i=0; i<5; i++) {
                                     if (!candidate || candidate === document.body) break;
                                     const parent = candidate.parentElement;
                                     if (!parent) break;
                                     
                                     const siblings = Array.from(parent.children).filter(el => el.tagName === candidate.tagName);
                                     if (siblings.length > 1) {
                                         // Found the list level. 'candidate' is the item type.
                                         const tag = candidate.tagName.toLowerCase();
                                         
                                         // 1. Try specific class on the item itself
                                         const classes = Array.from(candidate.classList).filter(c => !c.startsWith('rss-worker-'));
                                         if (classes.length > 0) {
                                             // Check if this class is common
                                             const commonClass = classes.find(cls => 
                                                 siblings.filter(s => s.classList.contains(cls)).length >= siblings.length / 2
                                             );
                                             if (commonClass) {
                                                 const tryPath = \`//\${tag}[contains(@class, "\${commonClass}")]\`;
                                                 // Check if this is too broad (matches way more than siblings)
                                                 try {
                                                     const count = document.evaluate(\`count(\${tryPath})\`, document, null, 1, null).numberValue;
                                                     if (count <= siblings.length * 3) { // Allow some margin
                                                         bestXPath = tryPath;
                                                         break;
                                                     }
                                                 } catch(e) {}
                                             }
                                         }
                                         
                                         // 2. Build path from a stable ancestor
                                         if (!bestXPath) {
                                             let curr = parent;
                                             let pathParts = [];
                                             let foundAnchor = false;
                                             
                                             // Go up to find ID or unique class
                                             for(let k=0; k<5; k++) { // Max 5 levels up
                                                 if (!curr || curr === document.body) break;
                                                 
                                                 const currTag = curr.tagName.toLowerCase();
                                                 if (curr.id) {
                                                     pathParts.unshift(\`*[@id="\${curr.id}"]\`);
                                                     foundAnchor = true;
                                                     break;
                                                 }
                                                 
                                                 const currClasses = Array.from(curr.classList).filter(c => !c.startsWith('rss-worker-'));
                                                 if (currClasses.length > 0) {
                                                     pathParts.unshift(\`\${currTag}[contains(@class, "\${currClasses[0]}")]\`);
                                                     // We assume class is better than just tag
                                                     // If we are at parent level (k=0), it's good.
                                                     foundAnchor = true;
                                                     // Don't break immediately if we want to find an ID higher up? 
                                                     // But for now let's stick to the first class we find to keep path short.
                                                     break; 
                                                 } else {
                                                     pathParts.unshift(currTag);
                                                 }
                                                 
                                                 curr = curr.parentElement;
                                             }
                                             
                                             if (pathParts.length > 0) {
                                                 // Use the anchor (first part) and the tag, with descendant separator
                                                 // This is more robust than a full path: //Anchor//Tag
                                                 bestXPath = \`//\${pathParts[0]}//\${tag}\`;
                                             }
                                         }
                                         
                                         if (bestXPath) break;
                                     }
                                     candidate = parent;
                                 }
                                 
                                 if (!bestXPath) {
                                     bestXPath = \`//\${target.tagName.toLowerCase()}\`;
                                 }
                                 
                                 selector = bestXPath;
                                 
                                 // Highlight
                                 try {
                                     const result = document.evaluate(selector, document, null, 7, null);
                                     document.querySelectorAll('.rss-worker-selected').forEach(el => el.classList.remove('rss-worker-selected'));
                                     for(let i=0; i<result.snapshotLength; i++) {
                                         result.snapshotItem(i).classList.add('rss-worker-selected');
                                     }
                                     console.log('Selected XPath:', selector, 'Matches:', result.snapshotLength);
                                 } catch(e) {}
                                 
                             } else {
                                 // Relative XPath
                                 if (!itemSelector) { alert('Please select item first'); return; }
                                 
                                 // Find item container
                                 let item = null;
                                 try {
                                     const itemsResult = document.evaluate(itemSelector, document, null, 7, null);
                                     for(let i=0; i<itemsResult.snapshotLength; i++) {
                                         const el = itemsResult.snapshotItem(i);
                                         if (el.contains(target)) {
                                             item = el;
                                             break;
                                         }
                                     }
                                 } catch(e) {
                                     alert('Invalid Item Selector'); return;
                                 }
                                 
                                 if (!item) { alert('Click inside item'); return; }
                                 
                                 // Smart Link Detection for XPath
                                 if (mode === 'link') {
                                     const link = target.closest('a');
                                     if (link && item.contains(link)) target = link;
                                 }

                                 // Generate relative path from item to target
                                 let current = target;
                                 let path = '';
                                 while(current && current !== item) {
                                     let seg = current.tagName.toLowerCase();
                                     const siblings = Array.from(current.parentNode.children).filter(el => el.tagName === current.tagName);
                                     if (siblings.length > 1) {
                                         let index = siblings.indexOf(current) + 1;
                                         seg += \`[\${index}]\`;
                                     }
                                     
                                     path = path ? seg + '/' + path : seg;
                                     current = current.parentNode;
                                 }
                                 
                                 selector = path ? './' + path : '.';
                             }

                        } else {
                            // CSS Selector Logic
                            if (mode === 'item') {
                                // Smart Item Detection v4: Local Sibling Analysis
                                // Strategy: Find the first ancestor that has siblings of the same tag.
                                // Then construct a selector based on common properties of those siblings.
                                
                                let candidate = target;
                                let bestSelector = '';
                                
                                // Traverse up to 8 levels
                                for (let i = 0; i < 8; i++) {
                                    if (!candidate || candidate === document.body || candidate === document.documentElement) break;
                                    
                                    const parent = candidate.parentElement;
                                    if (!parent) break;

                                    // Get all children of the parent
                                    const children = Array.from(parent.children);
                                    // Filter for elements with the same tag as candidate
                                    const sameTagSiblings = children.filter(el => el.tagName === candidate.tagName);
                                    
                                    // If we have at least 2 items (candidate + at least 1 sibling), this is a list!
                                    if (sameTagSiblings.length > 1) {
                                        const tag = candidate.tagName.toLowerCase();
                                        
                                        // Analyze classes
                                        // We want to find classes that are present on MOST siblings.
                                        const candidateClasses = Array.from(candidate.classList).filter(c => !c.startsWith('rss-worker-'));
                                        
                                        if (candidateClasses.length > 0) {
                                            // Check which classes are common
                                            const commonClasses = candidateClasses.filter(cls => {
                                                // Check if this class exists on at least 50% of siblings
                                                const count = sameTagSiblings.filter(sib => sib.classList.contains(cls)).length;
                                                return count >= sameTagSiblings.length / 2;
                                            });
                                            
                                            if (commonClasses.length > 0) {
                                                // Use the common classes
                                                bestSelector = tag + '.' + commonClasses.join('.');
                                            }
                                        }
                                        
                                        // If no common classes found (or candidate had no classes), try Ancestor Context
                                        if (!bestSelector) {
                                            // Try to find a stable ancestor (ID or Class) to anchor the selector
                                            let curr = parent;
                                            let ancestorSelector = '';
                                            
                                            // Walk up 6 levels to find an anchor
                                            for (let k = 0; k < 6; k++) {
                                                if (!curr || curr === document.body || curr === document.documentElement) break;
                                                
                                                const currClasses = Array.from(curr.classList).filter(c => !c.startsWith('rss-worker-'));
                                                if (curr.id) {
                                                    ancestorSelector = '#' + curr.id;
                                                    break;
                                                } else if (currClasses.length > 0) {
                                                    // Use the first class as anchor
                                                    ancestorSelector = '.' + currClasses[0];
                                                    break;
                                                }
                                                curr = curr.parentElement;
                                            }
                                            
                                            if (ancestorSelector) {
                                                // Try Ancestor descendant selector (space)
                                                // This is robust: ".article-list li"
                                                const trySel = ancestorSelector + ' ' + tag;
                                                try {
                                                    if (document.querySelectorAll(trySel).length > 1) {
                                                        bestSelector = trySel;
                                                    }
                                                } catch(e) {}
                                            }
                                            
                                            // Fallback to just tag if still nothing (and it matches multiple)
                                            if (!bestSelector) {
                                                if (document.querySelectorAll(tag).length > 1) {
                                                    bestSelector = tag;
                                                }
                                            }
                                        }
                                        
                                        // If we found a selector, verify it matches multiple items
                                        if (bestSelector) {
                                            try {
                                                if (document.querySelectorAll(bestSelector).length > 1) {
                                                    break; // Success!
                                                }
                                            } catch(e) {}
                                        }
                                    }
                                    
                                    candidate = parent;
                                }

                                // Fallback
                                if (!bestSelector) {
                                    // If we failed to find a list, we should NOT default to a unique selector.
                                    // We should try to find a generic selector for the target itself.
                                    
                                    const t = target;
                                    const tag = t.tagName.toLowerCase();
                                    const classes = Array.from(t.classList).filter(c => !c.startsWith('rss-worker-'));
                                    
                                    // Try Tag + Class (if matches > 1)
                                    if (classes.length > 0) {
                                        const s = tag + '.' + classes.join('.');
                                        if (document.querySelectorAll(s).length > 1) {
                                            bestSelector = s;
                                        }
                                    }
                                    
                                    // Try just Tag (if matches > 1)
                                    if (!bestSelector) {
                                        if (document.querySelectorAll(tag).length > 1) {
                                            bestSelector = tag;
                                        }
                                    }
                                    
                                    // If still nothing, then maybe it really is unique?
                                    if (!bestSelector) {
                                        bestSelector = tag;
                                        if (classes.length > 0) bestSelector += '.' + classes.join('.');
                                    }
                                }

                                selector = bestSelector;

                                // Highlight matches
                                document.querySelectorAll('.rss-worker-selected').forEach(el => el.classList.remove('rss-worker-selected'));
                                try {
                                    const matches = document.querySelectorAll(selector);
                                    matches.forEach(el => el.classList.add('rss-worker-selected'));
                                    console.log('Selected Item Selector:', selector, 'Matches:', matches.length);
                                } catch (err) {
                                    selector = target.tagName.toLowerCase();
                                }
                                
                            } else {
                                // Relative selector (title, link, desc, date)
                                if (!itemSelector) {
                                    alert('请先选择列表项(Item Selector)!');
                                    return;
                                }

                                // Smart Link Detection
                                if (mode === 'link') {
                                    const link = target.closest('a');
                                    if (link) target = link;
                                }

                                const item = target.closest(itemSelector);
                                if (!item) {
                                    alert('请在已选中的列表项(红色边框)内部点击！');
                                    return;
                                }
                                
                                // Generate GENERIC path from item to target (NO nth-of-type!)
                                // This selector should work for ALL items in the list
                                let current = target;
                                const path = [];
                                while (current && current !== item) {
                                    let seg = getOptimalSelector(current, item);
                                    
                                    // DO NOT add :nth-of-type() because we want this selector
                                    // to match the same element position in EVERY list item
                                    
                                    path.unshift(seg);
                                    current = current.parentElement;
                                }
                                
                                // Use descendant combinator (space) instead of child combinator (>)
                                // This is more robust and flexible
                                selector = path.join(' ');
                                
                                // If path is empty or just the element itself, use simple selector
                                if (!selector || selector === getOptimalSelector(target, item)) {
                                    selector = getOptimalSelector(target, item);
                                }
                            }
                        }

                        window.parent.postMessage({ type: 'selected', mode, selector }, '*');
                    }, true);
                })();
                </script>
                `;
                
                if (html.includes('</body>')) {
                    html = html.replace('</body>', `${helperScript}</body>`);
                } else {
                    html += helperScript;
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

        const paramName = Array.from(url.searchParams.keys())[0]
        const paramValue = url.searchParams.get(paramName)
        const format = url.searchParams.get("format") || 'rss'; // 新增：获取格式参数，默认为rss
        const forceRefresh = url.searchParams.has('refresh'); // 检查是否强制刷新

        if (!paramName || !paramValue) return new Response("缺少参数", { status: 400 })

        // 生成缓存键 - 如果强制刷新，添加时间戳使缓存键唯一
        const cacheKeyUrl = forceRefresh ? `${url.toString()}&t=${Date.now()}` : url.toString();
        const cacheKey = new Request(cacheKeyUrl)
        const cache = caches.default

        // 尝试从缓存中获取响应
        let response = await cache.match(cacheKey)
        if (response) {
            console.log("从缓存返回响应")
            // 添加缓存命中标识
            const newHeaders = new Headers(response.headers)
            newHeaders.set("X-Cache-Status", "HIT")
            newHeaders.set("X-Cache-Date", response.headers.get("Date") || new Date().toUTCString())
            
            return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: newHeaders
            })
        }

        if (paramName === "raw") {
            const resp = await fetchWithHeaders(paramValue, {
                headers: {
                    "Referer": paramValue,
                    "Origin": paramValue,
                }
            })
            const html = await resp.text()
            response = new Response(html, { 
                headers: { 
                    "content-type": "text/plain; charset=utf-8",
                    "Cache-Control": "public, max-age=30000", // 8小时缓存
                    "Date": new Date().toUTCString(),
                    "X-Cache-Status": "MISS"
                } 
            })
            // 存储到缓存
            await cache.put(cacheKey, response.clone())
            return response
        }

        if (paramName === "proxy") {
            const resp = await fetchWithHeaders(paramValue, {
                headers: {
                    "Referer": paramValue,
                    "Origin": paramValue,
                }
            })
            const requestedEncoding = url.searchParams.get('encoding') || undefined;

            // If content is textual (HTML/XML/JSON), decode to string respecting encoding
            const ct = (resp.headers.get('content-type') || '').toLowerCase();
                if (ct.includes('text') || ct.includes('xml') || ct.includes('json')) {
                    let bodyText = await decodeText(resp, requestedEncoding);
                    // If the resource is HTML, normalize its meta charset to UTF-8 so browser renders correctly
                    const lcCt = (resp.headers.get('content-type') || '').toLowerCase();
                    if (lcCt.includes('text/html')) {
                        try {
                            // Replace meta charset declarations in any HTML returned
                            bodyText = bodyText.replace(/<meta[^>]*charset=["']?[^"'\s>]+["']?[^>]*>/ig, '<meta charset="utf-8">');
                            bodyText = bodyText.replace(/<meta[^>]*http-equiv=["']?content-type["']?[^>]*>/ig, '<meta charset="utf-8">');
                        } catch (e) {}
                    }
                // When we decoded the body to a JS string, ensure the returned Content-Type declares UTF-8
                const origCt = resp.headers.get("content-type") || "text/plain";
                const baseType = origCt.split(";")[0].trim() || "text/plain";
                response = new Response(bodyText, {
                    headers: {
                        "content-type": baseType + "; charset=utf-8",
                        "Cache-Control": "public, max-age=3600", // 代理内容缓存1小时
                        "Date": new Date().toUTCString(),
                        "X-Cache-Status": "MISS"
                    }
                });
            } else {
                // Binary resources: stream raw bytes
                const content = await resp.arrayBuffer();
                response = new Response(content, {
                    headers: {
                        "content-type": resp.headers.get("content-type") || "application/octet-stream",
                        "Cache-Control": "public, max-age=3600", // 代理内容缓存1小时
                        "Date": new Date().toUTCString(),
                        "X-Cache-Status": "MISS"
                    }
                });
            }
            // 存储到缓存
            await cache.put(cacheKey, response.clone())
            return response
        }

        // --- Folder Feed Handling ---
        if (paramName === "folder") {
            if (!env.RSS_KV) {
                return new Response("KV Namespace 'RSS_KV' not bound.", { status: 500 });
            }
            
            const folderName = paramValue;
            const format = url.searchParams.get("format") || 'rss';
            
            const routes = await env.RSS_KV.get('routes', { type: 'json' }) || {};
            const folderRoutes = Object.entries(routes).filter(([key, config]) => config.folder === folderName);
            
            if (folderRoutes.length === 0) {
                return new Response("Folder not found or empty: " + folderName, { status: 404 });
            }
            
            // Fetch all feeds in parallel
            const feedPromises = folderRoutes.map(async ([key, config]) => {
                const params = {
                    param: key,
                    workerUrl: new URL(request.url).origin,
                    format: 'json', // Use JSON internally for easier merging
                    maxItems: config.maxItems || 20,
                };
                
                try {
                    let result;
                    if (config.type === 'telegram') {
                        result = await telegramRouter(params, config);
                    } else if (config.type === 'json') {
                        result = await jsonRouter(params, config);
                    } else if (config.type === 'rss') {
                        result = await feedRouter(params, config);
                    } else {
                        result = await customRouter(params, config);
                    }
                    
                    if (result.isError) return [];
                    
                    // Add source info to items
                    return result.items.map(item => ({
                        ...item,
                        sourceTitle: config.channelTitle || key,
                        title: `[${config.channelTitle || key}] ${item.title}`
                    }));
                } catch (e) {
                    console.error(`Error fetching route ${key} for folder ${folderName}:`, e);
                    return [];
                }
            });
            
            const results = await Promise.all(feedPromises);
            let allItems = results.flat();
            
            // Sort by date (descending)
            allItems.sort((a, b) => {
                const dateA = new Date(a.pubDate || 0);
                const dateB = new Date(b.pubDate || 0);
                return dateB - dateA;
            });
            
            // Limit total items (e.g. 50)
            allItems = allItems.slice(0, 50);
            
            const channel = {
                title: `Folder: ${folderName}`,
                link: new URL(request.url).origin + `/?folder=${encodeURIComponent(folderName)}`,
                description: `Combined feed for folder ${folderName}`,
            };
            
            // Import itemsToRss dynamically or ensure it's imported at top
            // It is imported at top as `import { itemsToRss } from './rss.js'`? No, I need to check imports.
            // Yes, it is not imported in main.js. I need to import it.
            // Wait, main.js imports customRouter etc, but not itemsToRss directly.
            // I should import it.
            
            // Actually, I can use the imported routers to generate RSS? No, they return { data, items }.
            // I need to generate RSS from merged items.
            // I need to import itemsToRss in main.js.
            
            // Let's assume I will add the import.
            
            const { itemsToRss } = await import('./rss.js');
            
            const rss = itemsToRss(allItems, channel, format);
            
            const contentTypes = {
                rss: "application/rss+xml; charset=utf-8",
                atom: "application/atom+xml; charset=utf-8",
                json: "application/json; charset=utf-8"
            }

            response = new Response(rss, {
                headers: { 
                    "content-type": contentTypes[format] || contentTypes.rss,
                    "Cache-Control": `public, max-age=1800`, // 30 mins cache for folders
                    "X-Cache-Status": "MISS",
                    "Date": new Date().toUTCString(),
                    "X-Generated-At": new Date().toISOString()
                }
            })
            await cache.put(cacheKey, response.clone())
            return response
        }

        // --- Custom Route Handling ---
        if (paramName === "custom") {
            if (!env.RSS_KV) {
                return new Response("KV Namespace 'RSS_KV' not bound.", { status: 500 });
            }
            
            // 支持扩展名格式: custom=name.rss, custom=name.atom, custom=name.json
            let routeKey = paramValue;
            let formatFromExt = format; // 默认使用URL参数的format
            
            // 检查是否有扩展名
            const extMatch = paramValue.match(/^(.+)\.(rss|atom|json)$/i);
            if (extMatch) {
                routeKey = extMatch[1]; // 去掉扩展名的路由名
                formatFromExt = extMatch[2].toLowerCase(); // 从扩展名获取格式
            }
            
            const routes = await env.RSS_KV.get('routes', { type: 'json' }) || {};
            const config = routes[routeKey];

            if (!config) {
                return new Response("Custom route not found: " + routeKey, { status: 404 });
            }

            // Load domain config
            const domainConfig = await env.RSS_KV.get('domain_config', { type: 'json' }) || { groups: [] };
            config.domainConfig = domainConfig;

            const params = {
                param: routeKey,
                workerUrl: new URL(request.url).origin,
                format: formatFromExt,
                maxItems: 20, // Default or from config
            };

            let result;
            try {
                if (config.type === 'telegram') {
                    result = await telegramRouter(params, config);
                } else if (config.type === 'json') {
                    result = await jsonRouter(params, config);
                } else if (config.type === 'rss') {
                    result = await feedRouter(params, config);
                } else {
                    result = await customRouter(params, config);
                }
            } catch (routerError) {
                console.error(`Router execution failed for ${routeKey}:`, routerError);
                result = {
                    isError: true,
                    message: `Internal Router Error: ${routerError.message}`,
                    data: '', // Will be handled below
                    items: []
                };
            }
            
            // --- Update Content Status & Config ---
            if (!result.isError) {
                try {
                    // 1. Update Status
                    if (result.items && result.items.length > 0) {
                        const latestItem = result.items[0];
                        const latestSig = (latestItem.link || '') + '|' + (latestItem.title || '');
                        
                        const statuses = await env.RSS_KV.get('route_statuses', { type: 'json' }) || {};
                        const currentStatus = statuses[routeKey] || {};
                        
                        if (currentStatus.latestSig !== latestSig) {
                            statuses[routeKey] = {
                                ...currentStatus, // Keep existing props like lastNotify
                                latestSig: latestSig,
                                lastUpdate: Date.now(),
                                itemCount: result.items.length
                            };
                            ctx.waitUntil(env.RSS_KV.put('route_statuses', JSON.stringify(statuses)));
                        }
                    }

                    // 2. Update Config if URL changed (Mirror Fallback)
                    if (result.newUrl && result.newUrl !== config.url) {
                        console.log(`[Auto Update] Updating URL for ${routeKey} from ${config.url} to ${result.newUrl}`);
                        config.url = result.newUrl;
                        config.updatedAt = Date.now();
                        
                        // We need to fetch fresh routes to avoid overwriting other concurrent changes
                        // But for simplicity and since we are in a worker, we can just update this key in the previously fetched object?
                        // No, better to be safe. But KV doesn't support atomic updates on single keys inside a JSON object.
                        // We have to read-modify-write the whole 'routes' object.
                        // Since we already read 'routes' above, we can reuse it, assuming low concurrency.
                        
                        routes[routeKey] = config;
                        ctx.waitUntil(env.RSS_KV.put('routes', JSON.stringify(routes)));
                    }

                } catch(e) {
                    console.error('Status/Config update error:', e);
                }
                
                // Partial failure notifications removed: only route-level errors will trigger Bark notifications.

            } else if (domainConfig.notifications?.barkUrl && (config.notifications?.barkEnabled !== false)) {
                // --- Error Notification Logic ---
                ctx.waitUntil((async () => {
                    try {
                        const statuses = await env.RSS_KV.get('route_statuses', { type: 'json' }) || {};
                        const currentStatus = statuses[routeKey] || {};
                        const lastNotify = currentStatus.lastNotify || 0;
                        const now = Date.now();
                        
                        // Notify at most once every 6 hours
                        if (now - lastNotify > 6 * 60 * 60 * 1000) {
                            // Build concise error summary. Per-node failure details are omitted by default.
                            let errorBody = `Route: ${routeKey}\nURL: ${config.url}\nError: ${result.message || 'Unknown error'}`;
                            if (result.failures && result.failures.length > 0) {
                                errorBody += `\n\nFailed Nodes: ${result.failures.length} node(s) (details omitted)`;
                            }

                            await sendBarkNotification(
                                domainConfig.notifications.barkUrl,
                                `RSS Worker Error: ${routeKey}`,
                                errorBody,
                                'RSS-Error',
                                request.url
                            );
                            
                            // Update status
                            currentStatus.lastNotify = now;
                            statuses[routeKey] = currentStatus;
                            await env.RSS_KV.put('route_statuses', JSON.stringify(statuses));
                        }
                    } catch (e) {
                        console.error('Notification error:', e);
                    }
                })());
            }
            
            // Reuse existing response generation logic
            const cacheTime = result.isError ? 60 : 3600; // Default cache times
            const rss = result.data;
            const contentTypes = {
                rss: "application/rss+xml; charset=utf-8",
                atom: "application/atom+xml; charset=utf-8",
                json: "application/json; charset=utf-8"
            }

            response = new Response(rss, {
                headers: { 
                    "content-type": contentTypes[formatFromExt] || contentTypes.rss,
                    "Cache-Control": `public, max-age=${cacheTime}`,
                    "X-Cache-Status": "MISS",
                    "Date": new Date().toUTCString(),
                    "X-Generated-At": new Date().toISOString()
                }
            })
            await cache.put(cacheKey, response.clone())
            return response
        }

        const func = funcs[paramName]  // 动态调用
        if (typeof func !== "function") {
            return new Response("未知参数：" + paramName, { status: 400 })
        }

        // 从配置中获取路由的特定配置，或使用默认配置
        const routeConfig = cacheConfig.routes[paramName] || cacheConfig.default;

        // 将所有需要的参数打包成一个对象
        const params = {
            param: paramValue,
            workerUrl: new URL(request.url).origin,
            format: format,
            maxItems: routeConfig.maxItems || cacheConfig.default.maxItems, // 优先用路由配置，否则用全局默认
        };

        const result = await func(params);

        // 从配置中获取缓存时间
        const cacheTime = result.isError ? routeConfig.error : routeConfig.success;
        const rss = result.data;


        const contentTypes = {
            rss: "application/rss+xml; charset=utf-8",
            atom: "application/atom+xml; charset=utf-8",
            json: "application/json; charset=utf-8"
        }

        response = new Response(rss, {
            headers: { 
                "content-type": contentTypes[format] || contentTypes.rss,
                "Cache-Control": `public, max-age=${cacheTime}`, // 使用从配置中获取的缓存时间
                "X-Cache-Status": "MISS", // 标识这是新生成的内容
                "Date": new Date().toUTCString(), // 添加生成时间
                "X-Generated-At": new Date().toISOString() // 生成时间戳
            }
        })

        // 存储到缓存
        await cache.put(cacheKey, response.clone())
        
        return response

    }
}




