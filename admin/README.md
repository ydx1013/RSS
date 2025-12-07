# 📁 Admin 模块说明

本目录包含 WorkerRSS 后台管理系统的核心模块。

## 📦 模块列表

### `router.js` - 路由分发器
- 处理所有 `/admin/*` 路径的请求
- 验证用户权限
- 分发到对应的业务模块
- 提供 Web 管理界面和 RESTful API

**主要功能**:
- 管理后台 HTML 界面生成
- API 路由分发
- JSON 响应标准化
- 错误处理

### `auth.js` - 认证中间件
- 多种认证方式支持（Bearer Token、Basic Auth、URL 参数）
- 安全验证逻辑
- Token 生成工具

**主要函数**:
- `verifyAuth(request, env)` - 验证用户权限
- `unauthorizedResponse()` - 返回 401 错误
- `generateToken(length)` - 生成随机 Token

### `subscription.js` - 订阅管理
- 使用 KV 存储订阅数据
- CRUD 完整操作
- 导入导出功能
- 搜索和统计

**主要函数**:
- `getAllSubscriptions(KV)` - 获取所有订阅
- `getSubscription(KV, id)` - 获取单个订阅
- `saveSubscription(KV, id, data)` - 保存订阅
- `deleteSubscription(KV, id)` - 删除订阅
- `searchSubscriptions(KV, query)` - 搜索订阅
- `exportSubscriptions(KV)` - 导出订阅
- `importSubscriptions(KV, subscriptions)` - 导入订阅
- `getSubscriptionStats(KV)` - 订阅统计

**数据结构**:
```javascript
// KV Key: sub:{id}
{
  "id": "github_owner/repo",
  "name": "项目名称",
  "platform": "github",
  "tags": ["tech", "news"],
  "note": "备注",
  "createdAt": "2025-12-07T10:00:00Z",
  "updatedAt": "2025-12-07T12:00:00Z"
}
```

### `cache.js` - 缓存管理
- 清除 Cloudflare Cache API 中的缓存
- 使用 KV 记录缓存元数据
- 提供缓存统计和分析

**主要函数**:
- `clearRouteCache(routeName, param, workerUrl)` - 清除单个缓存
- `clearMultipleCache(routes, workerUrl)` - 批量清除缓存
- `recordCacheMetadata(KV, routeName, param, cacheTime)` - 记录元数据
- `getAllCacheMetadata(KV)` - 获取所有元数据
- `getCacheStats(KV)` - 缓存统计
- `cleanExpiredMetadata(KV)` - 清理过期元数据

**数据结构**:
```javascript
// KV Key: cache:meta:{routeName}:{param}
{
  "routeName": "github",
  "param": "owner/repo",
  "cacheTime": 43200,
  "lastAccess": "2025-12-07T10:00:00Z",
  "expiresAt": "2025-12-07T22:00:00Z"
}
```

---

## 🔄 模块依赖关系

```
main.js (主入口)
  ↓
router.js (路由分发)
  ↓
auth.js (权限验证)
  ↓
┌─────────────────┬─────────────────┐
│                 │                 │
subscription.js   cache.js         (业务逻辑)
│                 │
└─────────────────┴─────────────────┘
                  ↓
            Cloudflare KV (数据存储)
```

---

## 🚀 使用示例

### 在主程序中集成

```javascript
// main.js
import { handleAdminRequest } from "./admin/router.js";
import { recordCacheMetadata } from "./admin/cache.js";

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        
        // 管理后台路由
        if (url.pathname.startsWith('/admin')) {
            return handleAdminRequest(request, env);
        }
        
        // RSS 路由...
        // 记录缓存元数据
        if (env.RSS_KV) {
            await recordCacheMetadata(env.RSS_KV, routeName, param, cacheTime);
        }
    }
}
```

### 直接调用业务模块

```javascript
import { getAllSubscriptions, saveSubscription } from "./admin/subscription.js";

// 获取所有订阅
const subscriptions = await getAllSubscriptions(env.RSS_KV);

// 添加新订阅
await saveSubscription(env.RSS_KV, "github_owner/repo", {
    name: "项目名称",
    platform: "github",
    tags: ["tech"]
});
```

---

## 🔐 安全注意事项

1. **环境变量管理**
   - 使用 `npx wrangler secret put` 设置敏感信息
   - 不要在代码中硬编码密钥
   - 不要将 `.env` 文件提交到 Git

2. **权限验证**
   - 所有管理 API 都必须通过 `verifyAuth` 验证
   - 建议使用 Bearer Token 而非 URL 参数
   - 定期轮换 Token

3. **输入验证**
   - 所有用户输入都应该验证和清理
   - 防止 XSS 注入
   - 限制请求频率

---

## 📚 扩展开发

### 添加新的管理功能

1. 创建新模块文件（如 `analytics.js`）
2. 实现业务逻辑函数
3. 在 `router.js` 中添加路由处理
4. 在 Web 界面添加对应的 UI

### 示例：添加访问统计功能

```javascript
// admin/analytics.js
export async function recordAccess(KV, routeName, param) {
    const key = `analytics:${routeName}:${param}`;
    const current = await KV.get(key, { type: 'json' }) || { count: 0 };
    current.count++;
    current.lastAccess = new Date().toISOString();
    await KV.put(key, JSON.stringify(current));
}

export async function getAccessStats(KV) {
    const list = await KV.list({ prefix: 'analytics:' });
    const stats = [];
    for (const key of list.keys) {
        const data = await KV.get(key.name, { type: 'json' });
        stats.push({ key: key.name, ...data });
    }
    return stats.sort((a, b) => b.count - a.count);
}
```

```javascript
// 在 router.js 中添加路由
if (path === '/admin/api/analytics') {
    const stats = await getAccessStats(KV);
    return jsonResponse({ success: true, data: stats });
}
```

---

## 🧪 测试建议

### 单元测试

```javascript
// 测试订阅管理
import { saveSubscription, getSubscription } from './subscription.js';

test('保存和读取订阅', async () => {
    const mockKV = createMockKV();
    await saveSubscription(mockKV, 'test-id', { name: 'Test' });
    const result = await getSubscription(mockKV, 'test-id');
    expect(result.name).toBe('Test');
});
```

### 集成测试

```bash
# 启动本地开发服务器
npx wrangler dev

# 测试 API
curl -H "Authorization: Bearer test-token" \
  http://localhost:8787/admin/api/subscriptions
```

---

## 📖 参考文档

- [完整管理文档](../ADMIN-GUIDE.md)
- [架构设计文档](../ARCHITECTURE.md)
- [使用示例](../EXAMPLES.md)
- [快速参考](../QUICK-REFERENCE.md)

---

**维护者**: WorkerRSS Team  
**最后更新**: 2025-12-07
