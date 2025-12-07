// admin/cache.js
// 缓存管理模块 - 管理 Cloudflare Cache API

/**
 * 清除指定路由的缓存
 * @param {string} routeName - 路由名称
 * @param {string} param - 路由参数
 * @param {string} workerUrl - Worker URL
 */
export async function clearRouteCache(routeName, param, workerUrl) {
    try {
        const cache = caches.default;
        const formats = ['rss', 'atom', 'json'];
        let clearedCount = 0;

        for (const format of formats) {
            const url = `${workerUrl}/?${routeName}=${param}&format=${format}`;
            const cacheKey = new Request(url);
            const deleted = await cache.delete(cacheKey);
            if (deleted) clearedCount++;
        }

        // 也清除不带 format 参数的默认缓存
        const defaultUrl = `${workerUrl}/?${routeName}=${param}`;
        const defaultDeleted = await cache.delete(new Request(defaultUrl));
        if (defaultDeleted) clearedCount++;

        return {
            success: true,
            clearedCount,
            message: `已清除 ${clearedCount} 个缓存条目`
        };
    } catch (error) {
        console.error('清除缓存失败:', error);
        return {
            success: false,
            message: error.message
        };
    }
}

/**
 * 批量清除缓存
 * @param {Array} routes - 路由列表 [{routeName, param}]
 * @param {string} workerUrl - Worker URL
 */
export async function clearMultipleCache(routes, workerUrl) {
    const results = {
        total: routes.length,
        success: 0,
        failed: 0,
        details: []
    };

    for (const route of routes) {
        const result = await clearRouteCache(route.routeName, route.param, workerUrl);
        if (result.success) {
            results.success++;
        } else {
            results.failed++;
        }
        results.details.push({
            route: `${route.routeName}=${route.param}`,
            ...result
        });
    }

    return results;
}

/**
 * 获取缓存信息（注意：Cache API 无法直接列举所有缓存）
 * @param {KVNamespace} KV - 使用 KV 存储缓存元数据
 */
export async function getCacheInfo(KV) {
    try {
        // 从 KV 读取缓存元数据（需要在缓存时写入）
        const metadata = await KV.get('cache:metadata', { type: 'json' });
        return metadata || {
            message: '缓存信息需要在使用过程中积累',
            hint: '每次 RSS 请求会自动记录缓存元数据'
        };
    } catch (error) {
        return {
            error: error.message
        };
    }
}

/**
 * 记录缓存元数据到 KV
 * @param {KVNamespace} KV - Cloudflare KV 命名空间
 * @param {string} routeName - 路由名称
 * @param {string} param - 路由参数
 * @param {number} cacheTime - 缓存时间（秒）
 */
export async function recordCacheMetadata(KV, routeName, param, cacheTime) {
    try {
        const key = `cache:meta:${routeName}:${param}`;
        const metadata = {
            routeName,
            param,
            cacheTime,
            lastAccess: new Date().toISOString(),
            expiresAt: new Date(Date.now() + cacheTime * 1000).toISOString()
        };

        await KV.put(key, JSON.stringify(metadata), {
            expirationTtl: cacheTime
        });
    } catch (error) {
        console.error('记录缓存元数据失败:', error);
    }
}

/**
 * 获取所有缓存元数据
 * @param {KVNamespace} KV - Cloudflare KV 命名空间
 */
export async function getAllCacheMetadata(KV) {
    try {
        const list = await KV.list({ prefix: 'cache:meta:' });
        const metadata = [];

        for (const key of list.keys) {
            const data = await KV.get(key.name, { type: 'json' });
            if (data) {
                metadata.push({
                    key: key.name.replace('cache:meta:', ''),
                    ...data
                });
            }
        }

        return {
            total: metadata.length,
            items: metadata.sort((a, b) => 
                new Date(b.lastAccess) - new Date(a.lastAccess)
            )
        };
    } catch (error) {
        console.error('获取缓存元数据失败:', error);
        return { total: 0, items: [], error: error.message };
    }
}

/**
 * 清除过期的缓存元数据
 * @param {KVNamespace} KV - Cloudflare KV 命名空间
 */
export async function cleanExpiredMetadata(KV) {
    try {
        const metadata = await getAllCacheMetadata(KV);
        let cleaned = 0;
        const now = new Date();

        for (const item of metadata.items) {
            if (new Date(item.expiresAt) < now) {
                await KV.delete(`cache:meta:${item.key}`);
                cleaned++;
            }
        }

        return {
            success: true,
            cleaned,
            message: `已清理 ${cleaned} 个过期缓存元数据`
        };
    } catch (error) {
        return {
            success: false,
            message: error.message
        };
    }
}

/**
 * 获取缓存统计信息
 * @param {KVNamespace} KV - Cloudflare KV 命名空间
 */
export async function getCacheStats(KV) {
    try {
        const metadata = await getAllCacheMetadata(KV);
        const stats = {
            total: metadata.total,
            byRoute: {},
            recentAccess: [],
            soonToExpire: []
        };

        // 按路由统计
        metadata.items.forEach(item => {
            const route = item.routeName;
            stats.byRoute[route] = (stats.byRoute[route] || 0) + 1;
        });

        // 最近访问（前10个）
        stats.recentAccess = metadata.items.slice(0, 10);

        // 即将过期（1小时内）
        const oneHourLater = new Date(Date.now() + 3600000);
        stats.soonToExpire = metadata.items
            .filter(item => new Date(item.expiresAt) < oneHourLater)
            .slice(0, 10);

        return stats;
    } catch (error) {
        return {
            error: error.message
        };
    }
}
