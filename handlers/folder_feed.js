import customRouter from "../routers/custom.js";
import { itemsToRss } from "../rss.js";

export async function handleFolderRequest(folderName, format, request, env, ctx, cache, cacheKey) {
    if (!env.RSS_KV) return new Response("KV Namespace 'RSS_KV' not bound.", { status: 500 });

    const routes = await env.RSS_KV.get('routes', { type: 'json' }) || {};
    // Fetch statuses early to compare changes
    const statuses = await env.RSS_KV.get('route_statuses', { type: 'json' }) || {};

    const folderRoutes = Object.entries(routes).filter(([key, config]) => config.folder === folderName);

    if (folderRoutes.length === 0) return new Response("Folder not found or empty: " + folderName, { status: 404 });

    // Batch collector
    const statusUpdates = {};

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

            // Check for updates
            if (result.items && result.items.length > 0) {
                const latestItem = result.items[0];
                const latestSig = (latestItem.link || '') + '|' + (latestItem.title || '') + '|' + (latestItem.description ? latestItem.description.length : 0);
                const currentStatus = statuses[key] || {};

                if (currentStatus.latestSig !== latestSig) {
                    statusUpdates[key] = {
                        ...currentStatus,
                        latestSig: latestSig,
                        lastUpdate: Date.now(),
                        itemCount: result.items.length
                    };
                }
            }

            return result.items.map(item => ({
                ...item,
                sourceTitle: config.channelTitle || key,
                title: `[${config.channelTitle || key}] ${item.title}`
            }));
        } catch (e) {
            console.error(`Error fetching route ${key} for folder ${folderName}: `, e);
            return [];
        }
    });

    const results = await Promise.all(feedPromises);

    // Save status updates if any
    if (Object.keys(statusUpdates).length > 0) {
        ctx.waitUntil((async () => {
            try {
                // Refetch statuses to minimize race conditions with other writes
                const latestStatuses = await env.RSS_KV.get('route_statuses', { type: 'json' }) || {};
                const merged = { ...latestStatuses, ...statusUpdates };
                await env.RSS_KV.put('route_statuses', JSON.stringify(merged));
            } catch (e) {
                console.error('Failed to save batch status updates:', e);
            }
        })());
    }

    let allItems = results.flat();

    allItems.sort((a, b) => {
        const dateA = new Date(a.pubDate || 0);
        const dateB = new Date(b.pubDate || 0);
        return dateB - dateA;
    });

    allItems = allItems.slice(0, 50);

    const channel = {
        title: `Folder: ${folderName}`,
        link: new URL(request.url).origin + `/?folder=${encodeURIComponent(folderName)}`,
        description: `Combined feed for folder ${folderName}`,
    };

    const rss = itemsToRss(allItems, channel, format);

    const contentTypes = {
        rss: "application/rss+xml; charset=utf-8",
        atom: "application/atom+xml; charset=utf-8",
        json: "application/json; charset=utf-8"
    }

    const response = new Response(rss, {
        headers: {
            "content-type": contentTypes[format] || contentTypes.rss,
            "Cache-Control": `public, max-age=1800`,
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
