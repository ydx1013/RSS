// config.js
// 缓存和项目数量配置

export const cacheConfig = {
    // 默认配置
    default: {
        success: 28800, // 成功时默认缓存 8 小时
        error: 600,     // 失败时默认缓存 10 分钟
        maxItems: 30,   // 默认最多获取 30 条
    },
    
    // 为特定路由单独配置
    routes: {
        // --- 高频更新 (新闻、社交) ---
        telegram: {
            success: 300,  // 5 分钟 - Telegram 消息更新不那么频繁
            error: 60,     // 1 分钟 - 错误状态可以快点重试
            maxItems: 25,   // Telegram 通常消息多，但我们取最近的 25 条
        },
        iqnew: {
            success: 7200,  // 2 小时
            error: 300,     // 5 分钟
            maxItems: 20,
        },
        "10jqka": {
            success: 3600,  // 1 小时
            error: 600,     // 10 分钟
            maxItems: 30,   // 新闻类可以多一些
        },
        cctv: {
            success: 7200,  // 2 小时
            error: 600,     // 10 分钟
            maxItems: 40,
        },
        // --- 低频更新 (软件发布、学术、存档) ---
        github: {
            success: 43200, // 12 小时
            error: 1800,    // 30 分钟
            maxItems: 15,   // Release 通常不多
        },
        researchgate: {
            success: 86400, // 24 小时
            error: 3600,    // 1 小时
            maxItems: 20,   // 学术文章
        },
        gushiyaowan: {
            success: 86400, // 24 小时
            error: 3600,    // 1 小时
            maxItems: 30,
        },
        hhkaobo: {
            success: 86400, // 24 小时
            error: 3600,    // 1 小时
            maxItems: 30,
        },
        bilibili: {
            success: 10,  // 10 秒
            error: 10,    // 10 秒
            maxItems: 20,   // Bilibili 视频列表，取最近 20 个
        },
        tracker: {
            success: 10, // 10 秒刷新一次稿件状态
            error: 300,    // 5 分钟后重试错误
            maxItems: 1,   // 单一稿件状态，只需要一条
        },
        
        // fellatiojapan 和 helixlife 等未配置的路由将使用上面的 default 设置
    }
};
