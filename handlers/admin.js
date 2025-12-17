import { adminHtml } from "../admin_ui.js";
import { checkAuth, generateToken } from "../utils/auth.js";
import { clearRouteCache } from "../utils/cache.js";
import { sendBarkNotification } from "../utils/notify.js";
import customRouter from "../routers/custom.js";
import jsonRouter from "../routers/json.js";
import feedRouter from "../routers/feed.js";

export async function handleAdminRequest(path, request, env) {
    const url = new URL(request.url);

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

            // Use sendBarkNotification
            try {
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

    // --- API for Test Translation ---
    if (path === '/api/admin/test-translation') {
        if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
        if (!checkAuth(request, env)) return new Response('Unauthorized', { status: 401 });

        try {
            const body = await request.json();
            const { provider, model, apiUrl, apiKey } = body;

            const { translateSingleItem } = await import("../utils/translator.js");

            // Mock item
            const item = {
                title: 'Hello World',
                description: 'This is a test message for translation.'
            };

            const logger = {
                log: () => { },
                warn: () => { },
                error: () => { }
            };

            const settings = { provider, model, apiUrl, apiKey };
            const targetLang = 'zh-CN';

            const resultItem = await translateSingleItem(item, targetLang, 'auto', settings, logger, {
                translation: { scope: 'both', format: 'replace' }
            });

            if (resultItem.isTranslated) {
                return new Response(JSON.stringify({
                    ok: true,
                    result: `Title: ${resultItem.title}`
                }), { headers: { 'Content-Type': 'application/json' } });
            } else {
                return new Response(JSON.stringify({
                    ok: false,
                    error: 'Translation returned original content (failed?)'
                }), { headers: { 'Content-Type': 'application/json' } });
            }

        } catch (e) {
            return new Response(JSON.stringify({ ok: false, error: e.message }), { headers: { 'Content-Type': 'application/json' }, status: 500 });
        }
    }

    if (path === '/admin/check') {
        const isAuth = checkAuth(request, env);
        if (isAuth) {
            return new Response('OK', { status: 200 });
        }
        return new Response('Unauthorized', { status: 401 });
    }

    // --- API for Admin Settings (Global Preferences) ---
    if (path === '/api/admin/settings') {
        if (!env.RSS_KV) return new Response("KV Namespace 'RSS_KV' not bound.", { status: 500 });
        if (!checkAuth(request, env)) return new Response('Unauthorized', { status: 401 });

        if (request.method === 'GET') {
            const settings = await env.RSS_KV.get('admin_settings', { type: 'json' }) || {};
            return new Response(JSON.stringify(settings), { headers: { 'Content-Type': 'application/json' } });
        }

        if (request.method === 'POST') {
            const body = await request.json();
            const existing = await env.RSS_KV.get('admin_settings', { type: 'json' }) || {};
            const newSettings = { ...existing, ...body };
            await env.RSS_KV.put('admin_settings', JSON.stringify(newSettings));
            return new Response("Saved", { status: 200 });
        }
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

    // --- API for Access Tokens (管理) ---
    if (path === '/api/tokens') {
        if (!env.RSS_KV) return new Response("KV Namespace 'RSS_KV' not bound.", { status: 500 });
        if (!checkAuth(request, env)) return new Response('Unauthorized', { status: 401 });

        // GET: list tokens
        if (request.method === 'GET') {
            const tokens = await env.RSS_KV.get('access_tokens', { type: 'json' }) || {};
            return new Response(JSON.stringify(tokens), { headers: { 'Content-Type': 'application/json' } });
        }

        // POST: create token
        if (request.method === 'POST') {
            const body = await request.json();
            const tokens = await env.RSS_KV.get('access_tokens', { type: 'json' }) || {};
            const id = body.id || (`t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`);
            const value = body.value || (`${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`);
            const now = Date.now();
            tokens[id] = {
                id,
                name: body.name || `token-${id}`,
                value,
                createdAt: now,
                expiresAt: body.expiresAt || null,
                maxRequestsPerDay: body.maxRequestsPerDay || null,
                requestsDayStamp: null,
                requestsToday: 0,
                allowedRoutes: Array.isArray(body.allowedRoutes) ? body.allowedRoutes : [],
                active: body.active !== false,
                lastUsed: null,
                note: body.note || ''
            };
            await env.RSS_KV.put('access_tokens', JSON.stringify(tokens));
            return new Response(JSON.stringify(tokens[id]), { headers: { 'Content-Type': 'application/json' } });
        }

        // PUT: update token
        if (request.method === 'PUT') {
            const body = await request.json();
            if (!body.id) return new Response('Missing id', { status: 400 });
            const tokens = await env.RSS_KV.get('access_tokens', { type: 'json' }) || {};
            const t = tokens[body.id];
            if (!t) return new Response('Not found', { status: 404 });
            const fields = ['name', 'expiresAt', 'maxRequestsPerDay', 'allowedRoutes', 'active', 'note', 'value'];
            fields.forEach(f => { if (body[f] !== undefined) t[f] = body[f]; });
            tokens[body.id] = t;
            await env.RSS_KV.put('access_tokens', JSON.stringify(tokens));
            return new Response(JSON.stringify(t), { headers: { 'Content-Type': 'application/json' } });
        }

        // DELETE: delete token (query param id)
        if (request.method === 'DELETE') {
            const id = url.searchParams.get('id');
            if (!id) return new Response('Missing id', { status: 400 });
            const tokens = await env.RSS_KV.get('access_tokens', { type: 'json' }) || {};
            if (tokens[id]) delete tokens[id];
            await env.RSS_KV.put('access_tokens', JSON.stringify(tokens));
            return new Response('Deleted', { status: 200 });
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
            const url = new URL(request.url);
            const list = await env.RSS_KV.get('routes', { type: 'json' }) || {};
            const statuses = await env.RSS_KV.get('route_statuses', { type: 'json' }) || {};

            // Fetch Single Route (for editing when list isn't fully loaded)
            if (url.searchParams.has('key')) {
                const key = url.searchParams.get('key');
                if (list[key]) {
                    const result = { [key]: list[key] };
                    if (statuses[key]) result[key].status = statuses[key];
                    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
                } else {
                    return new Response("{}", { headers: { 'Content-Type': 'application/json' } });
                }
            }

            // Opt-in Pagination
            if (url.searchParams.has('page')) {
                const page = parseInt(url.searchParams.get('page'), 10) || 1;
                const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10);

                // Reverse keys to show newest first (mimic original behavior)
                const allKeys = Object.keys(list).reverse();
                const total = allKeys.length;
                const totalPages = Math.ceil(total / pageSize);

                // Slice keys for current page
                const start = (page - 1) * pageSize;
                const end = start + pageSize;
                const pageKeys = allKeys.slice(start, end);

                const pageData = {};
                for (const key of pageKeys) {
                    pageData[key] = list[key];
                    if (statuses[key]) {
                        pageData[key].status = statuses[key];
                    }
                }

                return new Response(JSON.stringify({
                    data: pageData,
                    total: total,
                    page: page,
                    pageSize: pageSize,
                    totalPages: totalPages
                }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            } else {
                // Legacy: Return full list
                for (const key in list) {
                    if (statuses[key]) {
                        list[key].status = statuses[key];
                    }
                }
                return new Response(JSON.stringify(list), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }
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

            // Load admin settings for translation preview
            const adminSettings = await env.RSS_KV.get('admin_settings', { type: 'json' }) || {};
            config.globalSettings = adminSettings;
        }

        const params = {
            param: 'preview',
            workerUrl: new URL(request.url).origin,
            format: 'json', // Use JSON format internally for preview if needed, but we want raw items
            maxItems: 5, // Limit preview items
        };

        try {
            let result;
            if (config.type === 'json') {
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

    return null; // Not handled
}
