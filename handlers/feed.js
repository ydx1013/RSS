import customRouter from "../routers/custom.js";
import jsonRouter from "../routers/json.js";
import feedRouter from "../routers/feed.js";
import { cacheConfig } from "../config.js";
import { fetchWithHeaders } from "../utils/fetcher.js";
import { decodeText } from "../utils/helpers.js";
import { handleFolderRequest } from "./folder_feed.js";
import { handleCustomRouteRequest } from "./custom_feed.js";

const funcs = {
    custom: customRouter,
    json: jsonRouter,
    rss: feedRouter,
    feed: feedRouter
};

export async function handleFeedRequest(path, request, env, ctx) {
    const url = new URL(request.url);
    const paramName = Array.from(url.searchParams.keys())[0]
    const paramValue = url.searchParams.get(paramName)
    const format = url.searchParams.get("format") || 'rss';
    const forceRefresh = url.searchParams.has('refresh');

    if (!paramName || !paramValue) return null; // Not a feed request or missing params

    // Check if it's one of our handled params
    if (!['raw', 'proxy', 'folder', 'custom', 'json', 'rss', 'feed'].includes(paramName) && !funcs[paramName]) {
        return null; // Let main logic decide or return 404
    }
    // Load domain-level config (for token check and notifications)
    let domainConfig = {};
    try {
        if (env.RSS_KV) {
            domainConfig = await env.RSS_KV.get('domain_config', { type: 'json' }) || {};
        }
    } catch (e) {
        console.warn('Failed to load domain_config for token check:', e);
        domainConfig = {};
    }

    // Load admin settings (for translation API keys)
    let adminSettings = {};
    try {
        if (env.RSS_KV) {
            adminSettings = await env.RSS_KV.get('admin_settings', { type: 'json' }) || {};
        }
    } catch (e) {
        console.warn('Failed to load admin_settings:', e);
    }

    // Token protection: check against managed access_tokens KV first, fallback to legacy domain_config token
    try {
        const provided = url.searchParams.get('token') || '';

        // Load managed tokens
        const tokensStore = env.RSS_KV ? (await env.RSS_KV.get('access_tokens', { type: 'json' }) || {}) : {};
        const tokenEntries = Object.values(tokensStore || {});

        // Find matching token entry by value
        let matchedToken = null;
        if (provided) {
            matchedToken = tokenEntries.find(t => t && t.value && String(t.value) === provided);
        }

        // Determine whether protection is active: if we have any managed tokens
        const protectionActive = (tokenEntries.length > 0);
        if (protectionActive) {
            if (!provided) {
                return new Response('Access token missing', { status: 403 });
            }

            // If matched managed token, validate its metadata
            if (matchedToken) {
                if (matchedToken.active === false) return new Response('Token disabled', { status: 403 });
                if (matchedToken.expiresAt && Date.now() > Number(matchedToken.expiresAt)) return new Response('Token expired', { status: 403 });
                // Check allowed routes if specified
                if (Array.isArray(matchedToken.allowedRoutes) && matchedToken.allowedRoutes.length > 0) {
                    // allowedRoutes may contain patterns or exact route keys; simple exact match for now
                    if (!matchedToken.allowedRoutes.includes(paramValue)) {
                        return new Response('Token not allowed for this route', { status: 403 });
                    }
                }
                // Enforce per-day limit if set
                if (matchedToken.maxRequestsPerDay) {
                    const today = new Date().toISOString().slice(0, 10);
                    if (matchedToken.requestsDayStamp !== today) {
                        matchedToken.requestsDayStamp = today;
                        matchedToken.requestsToday = 0;
                    }
                    if ((matchedToken.requestsToday || 0) >= Number(matchedToken.maxRequestsPerDay)) {
                        return new Response('Rate limit exceeded', { status: 429 });
                    }
                    matchedToken.requestsToday = (matchedToken.requestsToday || 0) + 1;
                }
                matchedToken.lastUsed = Date.now();
                // record last route
                matchedToken.lastRoute = paramName + ':' + paramValue;
                // persist updated token
                try {
                    tokensStore[matchedToken.id] = matchedToken;
                    await env.RSS_KV.put('access_tokens', JSON.stringify(tokensStore));
                } catch (e) { console.warn('Failed to persist token usage:', e); }
            } else {
                // If no managed token matched, reject
                return new Response('Access token invalid', { status: 403 });
            }
        }
    } catch (e) {
        console.warn('Token validation error:', e);
    }
    // Actually, main.js has logic: if nothing matches, "Unknown parameter". 
    // So if we return null, main.js should handle 404 or welcome.
    // But let's handle "known" paramNames here.

    // Generate Key
    const cacheKeyUrl = forceRefresh ? `${url.toString()} & t=${Date.now()} ` : url.toString();
    const cacheKey = new Request(cacheKeyUrl)
    const cache = caches.default

    // Try Cache
    let response = await cache.match(cacheKey)
    if (response) {
        console.log("从缓存返回响应")
        const newHeaders = new Headers(response.headers)
        newHeaders.set("X-Cache-Status", "HIT")
        newHeaders.set("X-Cache-Date", response.headers.get("Date") || new Date().toUTCString())

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders
        })
    }

    // --- Raw Content ---
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
                "Cache-Control": "public, max-age=30000",
                "Date": new Date().toUTCString(),
                "X-Cache-Status": "MISS"
            }
        })
        await cache.put(cacheKey, response.clone())
        return response
    }

    // --- Proxy Content ---
    if (paramName === "proxy") {
        const resp = await fetchWithHeaders(paramValue, {
            headers: {
                "Referer": paramValue,
                "Origin": paramValue,
            }
        })
        const requestedEncoding = url.searchParams.get('encoding') || undefined;
        const ct = (resp.headers.get('content-type') || '').toLowerCase();

        if (ct.includes('text') || ct.includes('xml') || ct.includes('json')) {
            let bodyText = await decodeText(resp, requestedEncoding);
            if (ct.includes('text/html')) {
                try {
                    bodyText = bodyText.replace(/<meta[^>]*charset=["']?[^"'\s>]+["']?[^>]*>/ig, '<meta charset="utf-8">');
                    bodyText = bodyText.replace(/<meta[^>]*http-equiv=["']?content-type["']?[^>]*>/ig, '<meta charset="utf-8">');
                } catch (e) { }
            }
            const origCt = resp.headers.get("content-type") || "text/plain";
            const baseType = origCt.split(";")[0].trim() || "text/plain";
            response = new Response(bodyText, {
                headers: {
                    "content-type": baseType + "; charset=utf-8",
                    "Cache-Control": "public, max-age=3600",
                    "Date": new Date().toUTCString(),
                    "X-Cache-Status": "MISS"
                }
            });
        } else {
            const content = await resp.arrayBuffer();
            response = new Response(content, {
                headers: {
                    "content-type": resp.headers.get("content-type") || "application/octet-stream",
                    "Cache-Control": "public, max-age=3600",
                    "Date": new Date().toUTCString(),
                    "X-Cache-Status": "MISS"
                }
            });
        }
        await cache.put(cacheKey, response.clone())
        return response
    }

    // --- Folder Feed ---
    if (paramName === "folder") {
        return handleFolderRequest(paramValue, format, request, env, ctx, cache, cacheKey);
    }

    // --- Custom Route ---
    if (paramName === "custom") {
        // Inject adminSettings into domainConfig for now, or pass as extra arg
        // handleCustomRouteRequest signature: (paramValue, format, request, env, ctx, domainConfig, cache, cacheKey)
        // We need to pass adminSettings separately or merge. 
        // Let's modify handleCustomRouteRequest to accept globalSettings? Or merge into domainConfig.
        // Merging is easier for now without changing signature too much, but domainConfig is specific structure.
        // Let's attach it to domainConfig as a property if that's safe.
        domainConfig.globalSettings = adminSettings;
        return handleCustomRouteRequest(paramValue, format, request, env, ctx, domainConfig, cache, cacheKey);
    }

    // --- Legacy / Other Routers (json, rss, feed, etc) ---
    const func = funcs[paramName];
    if (typeof func !== "function") return new Response("未知参数：" + paramName, { status: 400 });

    const routeConfig = cacheConfig.routes[paramName] || cacheConfig.default;
    const params = {
        param: paramValue,
        workerUrl: new URL(request.url).origin,
        format: format,
        maxItems: routeConfig.maxItems || cacheConfig.default.maxItems,

        globalSettings: adminSettings
    };

    const result = await func(params);
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
            "Cache-Control": `public, max - age=${cacheTime} `,
            "X-Cache-Status": "MISS",
            "Date": new Date().toUTCString(),
            "X-Generated-At": new Date().toISOString()
        }
    })
    await cache.put(cacheKey, response.clone())
    return response
}
