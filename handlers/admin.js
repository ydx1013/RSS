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
