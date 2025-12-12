// config.js
// 缓存和项目数量配置

export const cacheConfig = {
    // 默认配置
    default: {
        success: 28800, // 成功时默认缓存 8 小时
        error: 600,     // 失败时默认缓存 10 分钟
        maxItems: 30,   // 默认最多获取 30 条
    },

    // 管理员密码配置（使用环境变量或在此设置）
    adminPassword: '', // 留空则不需要密码，设置后需要密码才能访问管理页面

};
