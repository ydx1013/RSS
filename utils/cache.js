// 缓存管理工具模块

/**
 * 清除指定路由的所有格式缓存
 * @param {string} key - 路由key
 * @param {string} origin - 请求来源URL
 */
export async function clearRouteCache(key, origin) {
    const cache = caches.default;
    const formats = ['rss', 'atom', 'json'];
    
    // 清除所有格式的缓存
    for (const fmt of formats) {
        try {
            const cacheUrl = `${origin}/?custom=${key}&format=${fmt}`;
            await cache.delete(new Request(cacheUrl));
            console.log(`Cleared cache for: ${cacheUrl}`);
        } catch(e) {
            console.error('Cache delete error:', e);
        }
    }
    
    // 清除带扩展名的缓存
    for (const ext of ['rss', 'atom', 'json']) {
        try {
            const cacheUrl = `${origin}/?custom=${key}.${ext}`;
            await cache.delete(new Request(cacheUrl));
            console.log(`Cleared cache for: ${cacheUrl}`);
        } catch(e) {
            console.error('Cache delete error:', e);
        }
    }
    
    // 清除默认缓存（不带format参数）
    try {
        const defaultCacheUrl = `${origin}/?custom=${key}`;
        await cache.delete(new Request(defaultCacheUrl));
        console.log(`Cleared default cache for: ${defaultCacheUrl}`);
    } catch(e) {
        console.error('Cache delete error:', e);
    }
}

/**
 * 从缓存中获取响应
 * @param {Request} request - 请求对象
 * @returns {Promise<Response|null>} 缓存的响应或null
 */
export async function getCachedResponse(request) {
    const cache = caches.default;
    return await cache.match(request);
}

/**
 * 将响应存入缓存
 * @param {Request} request - 请求对象
 * @param {Response} response - 响应对象
 * @param {number} ttl - 缓存时间（秒）
 */
export async function putCachedResponse(request, response, ttl) {
    const cache = caches.default;
    const responseToCache = response.clone();
    
    // 设置Cache-Control头
    const headers = new Headers(responseToCache.headers);
    headers.set('Cache-Control', `public, max-age=${ttl}`);
    
    const cachedResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers
    });
    
    await cache.put(request, cachedResponse);
}
