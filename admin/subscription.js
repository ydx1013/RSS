// admin/subscription.js
// 订阅管理模块 - 使用 KV 存储用户订阅数据

/**
 * 获取所有订阅列表
 * @param {KVNamespace} KV - Cloudflare KV 命名空间
 * @returns {Array} 订阅列表
 */
export async function getAllSubscriptions(KV) {
    try {
        const list = await KV.list({ prefix: 'sub:' });
        const subscriptions = [];

        for (const key of list.keys) {
            const data = await KV.get(key.name, { type: 'json' });
            if (data) {
                subscriptions.push({
                    id: key.name.replace('sub:', ''),
                    ...data,
                    createdAt: key.metadata?.createdAt || data.createdAt || new Date().toISOString()
                });
            }
        }

        return subscriptions;
    } catch (error) {
        console.error('获取订阅列表失败:', error);
        return [];
    }
}

/**
 * 获取单个订阅
 * @param {KVNamespace} KV - Cloudflare KV 命名空间
 * @param {string} id - 订阅 ID
 */
export async function getSubscription(KV, id) {
    try {
        const data = await KV.get(`sub:${id}`, { type: 'json' });
        return data;
    } catch (error) {
        console.error('获取订阅失败:', error);
        return null;
    }
}

/**
 * 创建或更新订阅
 * @param {KVNamespace} KV - Cloudflare KV 命名空间
 * @param {string} id - 订阅 ID（如 github_username/repo）
 * @param {Object} data - 订阅数据
 */
export async function saveSubscription(KV, id, data) {
    try {
        const subscription = {
            ...data,
            updatedAt: new Date().toISOString()
        };

        // 如果是新订阅，添加创建时间
        const existing = await getSubscription(KV, id);
        if (!existing) {
            subscription.createdAt = new Date().toISOString();
        } else {
            subscription.createdAt = existing.createdAt;
        }

        await KV.put(`sub:${id}`, JSON.stringify(subscription), {
            metadata: { createdAt: subscription.createdAt }
        });

        return subscription;
    } catch (error) {
        console.error('保存订阅失败:', error);
        throw error;
    }
}

/**
 * 删除订阅
 * @param {KVNamespace} KV - Cloudflare KV 命名空间
 * @param {string} id - 订阅 ID
 */
export async function deleteSubscription(KV, id) {
    try {
        await KV.delete(`sub:${id}`);
        return true;
    } catch (error) {
        console.error('删除订阅失败:', error);
        return false;
    }
}

/**
 * 批量导入订阅
 * @param {KVNamespace} KV - Cloudflare KV 命名空间
 * @param {Array} subscriptions - 订阅列表
 */
export async function importSubscriptions(KV, subscriptions) {
    const results = {
        success: 0,
        failed: 0,
        errors: []
    };

    for (const sub of subscriptions) {
        try {
            await saveSubscription(KV, sub.id, sub);
            results.success++;
        } catch (error) {
            results.failed++;
            results.errors.push({
                id: sub.id,
                error: error.message
            });
        }
    }

    return results;
}

/**
 * 导出所有订阅为 JSON
 * @param {KVNamespace} KV - Cloudflare KV 命名空间
 */
export async function exportSubscriptions(KV) {
    const subscriptions = await getAllSubscriptions(KV);
    return {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        count: subscriptions.length,
        subscriptions
    };
}

/**
 * 搜索订阅
 * @param {KVNamespace} KV - Cloudflare KV 命名空间
 * @param {string} query - 搜索关键词
 */
export async function searchSubscriptions(KV, query) {
    const allSubs = await getAllSubscriptions(KV);
    const lowerQuery = query.toLowerCase();

    return allSubs.filter(sub => {
        return (
            sub.id.toLowerCase().includes(lowerQuery) ||
            (sub.name && sub.name.toLowerCase().includes(lowerQuery)) ||
            (sub.platform && sub.platform.toLowerCase().includes(lowerQuery)) ||
            (sub.tags && sub.tags.some(tag => tag.toLowerCase().includes(lowerQuery)))
        );
    });
}

/**
 * 获取订阅统计信息
 * @param {KVNamespace} KV - Cloudflare KV 命名空间
 */
export async function getSubscriptionStats(KV) {
    const subscriptions = await getAllSubscriptions(KV);
    
    const stats = {
        total: subscriptions.length,
        byPlatform: {},
        recentlyAdded: [],
        recentlyUpdated: []
    };

    // 按平台统计
    subscriptions.forEach(sub => {
        const platform = sub.platform || 'unknown';
        stats.byPlatform[platform] = (stats.byPlatform[platform] || 0) + 1;
    });

    // 最近添加的订阅（前5个）
    stats.recentlyAdded = subscriptions
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5);

    // 最近更新的订阅（前5个）
    stats.recentlyUpdated = subscriptions
        .filter(sub => sub.updatedAt)
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, 5);

    return stats;
}
