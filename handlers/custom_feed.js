import customRouter from "../routers/custom.js";
import { sendBarkNotification } from "../utils/notify.js";

export async function handleCustomRouteRequest(paramValue, format, request, env, ctx, domainConfig, cache, cacheKey) {
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

    // Inject key for routers to use as fallback title
    config.key = routeKey;

    // reuse previously loaded domainConfig (loaded for token check) if available
    config.domainConfig = domainConfig || (await env.RSS_KV.get('domain_config', { type: 'json' }) || { groups: [] });

    // Load admin settings for translation support
    config.globalSettings = domainConfig.globalSettings || (await env.RSS_KV.get('admin_settings', { type: 'json' }) || {});

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
                const latestSig = (latestItem.link || '') + '|' + (latestItem.title || '') + '|' + (latestItem.description ? latestItem.description.length : 0);
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

    const response = new Response(rss, {
        headers: {
            "content-type": contentTypes[formatFromExt] || contentTypes.rss,
            "Cache-Control": `public, max - age=${cacheTime} `,
            "X-Cache-Status": "MISS",
            "Date": new Date().toUTCString(),
            "X-Generated-At": new Date().toISOString()
        }
    })

    if (cache && cacheKey) {
        await cache.put(cacheKey, response.clone())
    }

    return response;
}
