import customRouter from "../routers/custom.js";
import jsonRouter from "../routers/json.js";
import feedRouter from "../routers/feed.js";
import { cacheConfig } from "../config.js";
import { fetchWithHeaders } from "../utils/fetcher.js";
import { decodeText } from "../utils/helpers.js";
import { sendBarkNotification } from "../utils/notify.js";
import { itemsToRss } from "../rss.js";

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
        if (!env.RSS_KV) return new Response("KV Namespace 'RSS_KV' not bound.", { status: 500 });

        const folderName = paramValue;
        const routes = await env.RSS_KV.get('routes', { type: 'json' }) || {};
        const folderRoutes = Object.entries(routes).filter(([key, config]) => config.folder === folderName);

        if (folderRoutes.length === 0) return new Response("Folder not found or empty: " + folderName, { status: 404 });

        const feedPromises = folderRoutes.map(async ([key, config]) => {
            const params = {
                param: key,
                workerUrl: new URL(request.url).origin,
                format: 'json',
                maxItems: config.maxItems || 20,
            };
            try {
                let result = await customRouter(params, config);
                if (result.isError) return [];
                return result.items.map(item => ({
                    ...item,
                    sourceTitle: config.channelTitle || key,
                    title: `[${config.channelTitle || key}]${item.title} `
                }));
            } catch (e) {
                console.error(`Error fetching route ${key} for folder ${folderName}: `, e);
                return [];
            }
        });

        const results = await Promise.all(feedPromises);
        let allItems = results.flat();

        allItems.sort((a, b) => {
            const dateA = new Date(a.pubDate || 0);
            const dateB = new Date(b.pubDate || 0);
            return dateB - dateA;
        });

        allItems = allItems.slice(0, 50);

        const channel = {
            title: `Folder: ${folderName} `,
            link: new URL(request.url).origin + `/? folder = ${encodeURIComponent(folderName)} `,
            description: `Combined feed for folder ${folderName}`,
        };

        const rss = itemsToRss(allItems, channel, format);

        const contentTypes = {
            rss: "application/rss+xml; charset=utf-8",
            atom: "application/atom+xml; charset=utf-8",
            json: "application/json; charset=utf-8"
        }

        response = new Response(rss, {
            headers: {
                "content-type": contentTypes[format] || contentTypes.rss,
                "Cache-Control": `public, max - age=1800`,
                "X-Cache-Status": "MISS",
                "Date": new Date().toUTCString(),
                "X-Generated-At": new Date().toISOString()
            }
        })
        await cache.put(cacheKey, response.clone())
        return response
    }

    // --- Custom Route ---
    if (paramName === "custom") {
        if (!env.RSS_KV) return new Response("KV Namespace 'RSS_KV' not bound.", { status: 500 });

        let routeKey = paramValue;
        let formatFromExt = format;

        const extMatch = paramValue.match(/^(.+)\.(rss|atom|json)$/i);
        if (extMatch) {
            routeKey = extMatch[1];
            formatFromExt = extMatch[2].toLowerCase();
        }

        const routes = await env.RSS_KV.get('routes', { type: 'json' }) || {};
        const config = routes[routeKey];
        if (!config) return new Response("Custom route not found: " + routeKey, { status: 404 });

        const domainConfig = await env.RSS_KV.get('domain_config', { type: 'json' }) || { groups: [] };
        config.domainConfig = domainConfig;

        const params = {
            param: routeKey,
            workerUrl: new URL(request.url).origin,
            format: formatFromExt,
            maxItems: 20,
        };

        let result;
        try {
            result = await customRouter(params, config);
        } catch (routerError) {
            console.error(`Router execution failed for ${routeKey}: `, routerError);
            result = {
                isError: true,
                message: `Internal Router Error: ${routerError.message} `,
                data: '',
                items: []
            };
        }

        if (!result.isError) {
            try {
                if (result.items && result.items.length > 0) {
                    const latestItem = result.items[0];
                    const latestSig = (latestItem.link || '') + '|' + (latestItem.title || '');
                    const statuses = await env.RSS_KV.get('route_statuses', { type: 'json' }) || {};
                    const currentStatus = statuses[routeKey] || {};

                    if (currentStatus.latestSig !== latestSig) {
                        statuses[routeKey] = {
                            ...currentStatus,
                            latestSig: latestSig,
                            lastUpdate: Date.now(),
                            itemCount: result.items.length
                        };
                        ctx.waitUntil(env.RSS_KV.put('route_statuses', JSON.stringify(statuses)));
                    }
                }
                if (result.newUrl && result.newUrl !== config.url) {
                    config.url = result.newUrl;
                    config.updatedAt = Date.now();
                    routes[routeKey] = config;
                    ctx.waitUntil(env.RSS_KV.put('routes', JSON.stringify(routes)));
                }
            } catch (e) { console.error('Status/Config update error:', e); }
        } else if (domainConfig.notifications?.barkUrl && (config.notifications?.barkEnabled !== false)) {
            ctx.waitUntil((async () => {
                try {
                    const statuses = await env.RSS_KV.get('route_statuses', { type: 'json' }) || {};
                    const currentStatus = statuses[routeKey] || {};
                    const lastNotify = currentStatus.lastNotify || 0;
                    const now = Date.now();
                    if (now - lastNotify > 6 * 60 * 60 * 1000) {
                        let errorBody = `Route: ${routeKey} \nURL: ${config.url} \nError: ${result.message || 'Unknown error'} `;
                        if (result.failures && result.failures.length > 0) errorBody += `\n\nFailed Nodes: ${result.failures.length}`;
                        await sendBarkNotification(domainConfig.notifications.barkUrl, `RSS Worker Error: ${routeKey} `, errorBody, 'RSS-Error', request.url);
                        currentStatus.lastNotify = now;
                        statuses[routeKey] = currentStatus;
                        await env.RSS_KV.put('route_statuses', JSON.stringify(statuses));
                    }
                } catch (e) { console.error('Notification error:', e); }
            })());
        }

        const cacheTime = result.isError ? 60 : 3600;
        const rss = result.data;
        const contentTypes = {
            rss: "application/rss+xml; charset=utf-8",
            atom: "application/atom+xml; charset=utf-8",
            json: "application/json; charset=utf-8"
        }

        response = new Response(rss, {
            headers: {
                "content-type": contentTypes[formatFromExt] || contentTypes.rss,
                "Cache-Control": `public, max - age=${cacheTime} `,
                "X-Cache-Status": "MISS",
                "Date": new Date().toUTCString(),
                "X-Generated-At": new Date().toISOString()
            }
        })
        await cache.put(cacheKey, response.clone())
        return response
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
