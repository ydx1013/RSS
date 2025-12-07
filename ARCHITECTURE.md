# 📁 WorkerRSS 项目结构说明

## 🌳 目录结构

```
WorkerRSS/
├── 📄 main.js                    # 主入口 - Worker 请求处理
├── 📄 rss.js                     # RSS 生成工具 - 支持 RSS/Atom/JSON
├── 📄 config.js                  # 缓存配置 - 各路由的缓存策略
├── 📄 package.json               # 依赖管理
├── 📄 wrangler.toml              # Worker 配置文件
│
├── 📂 routers/                   # 🌐 各平台数据解析器
│   ├── github.js                # GitHub Releases
│   ├── bilibili.js              # Bilibili 视频
│   ├── telegram.js              # Telegram 频道
│   ├── cctv.js                  # CCTV 新闻
│   ├── dlsite.js                # DLsite 商品
│   ├── kemono.js                # Kemono Party
│   ├── researchgate.js          # 学术论文
│   ├── helixlife.js             # 解螺旋课程
│   ├── hhkaobo.js               # 弘博考博网
│   ├── gushiyaowan.js           # 古诗文网
│   ├── 10jqka.js                # 同花顺财经
│   ├── iqnew.js                 # IQ 新闻
│   ├── tracker.js               # 追踪器
│   ├── cospuri.js               # Cospuri
│   ├── fellatiojapan.js         # Fellatio Japan
│   └── javbus.js                # Javbus
│
├── 📂 admin/                     # 🎛️ 后台管理系统（新增）
│   ├── router.js                # 管理路由分发
│   ├── auth.js                  # 认证中间件
│   ├── subscription.js          # 订阅管理模块
│   └── cache.js                 # 缓存管理模块
│
├── 📂 文档/
│   ├── 📖 README.md             # 项目介绍
│   ├── 📖 AI-GUIDE.md           # AI 辅助开发指南
│   ├── 📖 ADMIN-GUIDE.md        # 管理后台完整文档（新增）
│   ├── 📖 EXAMPLES.md           # 使用示例（新增）
│   └── 📄 备忘录.txt            # 开发备忘
│
└── 📂 部署脚本/
    ├── deploy.sh                # Linux/Mac 部署脚本（新增）
    └── deploy.ps1               # Windows 部署脚本（新增）
```

---

## 📦 核心模块说明

### 1. main.js - 主入口

**职责**: 
- 接收所有 HTTP 请求
- 路由分发（RSS 路由 vs 管理后台路由）
- 缓存管理（读取、写入、过期控制）
- 记录缓存元数据到 KV

**关键逻辑**:
```javascript
// 管理后台路由判断
if (url.pathname.startsWith('/admin')) {
    return handleAdminRequest(request, env)
}

// RSS 路由处理
const func = funcs[paramName]  // 动态调用路由器
const result = await func(params)

// 缓存策略应用
const cacheTime = result.isError ? routeConfig.error : routeConfig.success
```

**输入输出**:
- 输入: `https://worker.dev/?github=owner/repo&format=atom`
- 输出: RSS/Atom/JSON 格式的 feed

---

### 2. rss.js - RSS 生成工具

**职责**: 
- 将标准化的 items 数组转换为 RSS/Atom/JSON Feed
- 处理 CDATA、日期格式、命名空间

**API**:
```javascript
itemsToRss(items, channel, format)
// items: [{title, link, description, author, guid, pubDate, enclosure}]
// channel: {title, link, description, image}
// format: 'rss' | 'atom' | 'json'
```

**示例**:
```javascript
const items = [
    {
        title: "VS Code 1.85 Released",
        link: "https://github.com/microsoft/vscode/releases/tag/1.85",
        description: "<![CDATA[<h3>新特性</h3><ul>...</ul>]]>",
        author: "microsoft",
        guid: "vscode-1.85",
        pubDate: "Thu, 07 Dec 2025 10:00:00 GMT"
    }
];

const channel = {
    title: "VS Code Releases",
    link: "https://github.com/microsoft/vscode/releases",
    description: "Visual Studio Code 发布记录",
    image: "https://github.githubassets.com/assets/GitHub-Mark.png"
};

const rss = itemsToRss(items, channel, 'rss');
```

---

### 3. config.js - 缓存配置

**职责**: 
- 集中管理所有路由的缓存时间
- 区分成功和失败的缓存策略
- 控制每个路由返回的最大条目数

**结构**:
```javascript
{
    default: {
        success: 28800,  // 8 小时
        error: 600,      // 10 分钟
        maxItems: 30
    },
    routes: {
        github: {
            success: 43200,  // 12 小时
            error: 1800,
            maxItems: 15
        },
        telegram: {
            success: 300,    // 5 分钟（高频更新）
            error: 60,
            maxItems: 25
        }
    }
}
```

**使用场景**:
- 高频更新内容（新闻、社交）：短缓存时间（5-60分钟）
- 低频更新内容（软件发布、学术）：长缓存时间（12-24小时）
- 错误状态：快速重试（1-10分钟）

---

### 4. routers/* - 平台解析器

**职责**: 
- 抓取特定平台的数据
- 解析 HTML/API 响应
- 转换为标准化的 items 格式

**标准接口**:
```javascript
export default async function (params) {
    const { param, workerUrl, format, maxItems } = params;
    
    try {
        // 1. 获取数据
        const response = await fetch(apiUrl);
        const data = await response.json();
        
        // 2. 解析数据
        let items = data.map(item => ({
            title: item.title,
            link: item.url,
            description: `<![CDATA[${item.content}]]>`,
            author: item.author,
            guid: item.id,
            pubDate: new Date(item.date).toUTCString()
        }));
        
        // 3. 限制数量
        if (items.length > maxItems) {
            items = items.slice(0, maxItems);
        }
        
        // 4. 生成 RSS
        const channel = { title, link, description, image };
        return {
            data: itemsToRss(items, channel, format),
            isError: false
        };
    } catch (error) {
        // 错误处理
        return {
            data: itemsToRss(errorItems, errorChannel, format),
            isError: true
        };
    }
}
```

**实现技巧**:
- 使用 Cheerio 解析 HTML
- 使用 Luxon 处理日期
- 错误时返回友好提示而非空白

---

### 5. admin/router.js - 管理路由分发

**职责**: 
- 处理所有 `/admin/*` 路径的请求
- 验证用户权限
- 调用对应的业务模块
- 返回 JSON 或 HTML 响应

**路由表**:
```
GET  /admin                          → 管理后台 HTML 界面
GET  /admin/api/subscriptions        → 获取所有订阅
POST /admin/api/subscriptions        → 创建订阅
GET  /admin/api/subscriptions/:id    → 获取单个订阅
PUT  /admin/api/subscriptions/:id    → 更新订阅
DELETE /admin/api/subscriptions/:id  → 删除订阅
GET  /admin/api/subscriptions/export → 导出订阅
POST /admin/api/subscriptions/import → 导入订阅
GET  /admin/api/subscriptions/stats  → 订阅统计
POST /admin/api/cache/clear          → 清除缓存
GET  /admin/api/cache/metadata       → 缓存元数据
GET  /admin/api/cache/stats          → 缓存统计
POST /admin/api/cache/clean          → 清理过期元数据
GET  /admin/api/system/info          → 系统信息
```

---

### 6. admin/auth.js - 认证中间件

**职责**: 
- 验证 Bearer Token
- 验证 Basic Auth
- 验证 URL 参数 Token
- 返回 401 错误响应

**认证流程**:
```javascript
function verifyAuth(request, env) {
    // 1. 尝试 Bearer Token
    if (authHeader.startsWith('Bearer ')) {
        return token === env.ADMIN_TOKEN;
    }
    
    // 2. 尝试 Basic Auth
    if (authHeader.startsWith('Basic ')) {
        const [username, password] = decodeCredentials();
        return username === env.ADMIN_USERNAME && 
               password === env.ADMIN_PASSWORD;
    }
    
    // 3. 尝试 URL 参数
    const tokenParam = url.searchParams.get('token');
    return tokenParam === env.ADMIN_TOKEN;
}
```

---

### 7. admin/subscription.js - 订阅管理

**职责**: 
- CRUD 操作（创建、读取、更新、删除）
- 导入导出订阅
- 搜索和统计
- 使用 KV 持久化数据

**KV 数据结构**:
```javascript
// 键: sub:github_owner/repo
// 值:
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

**核心函数**:
- `getAllSubscriptions(KV)` - 列举所有订阅
- `getSubscription(KV, id)` - 获取单个订阅
- `saveSubscription(KV, id, data)` - 保存订阅
- `deleteSubscription(KV, id)` - 删除订阅
- `searchSubscriptions(KV, query)` - 搜索订阅
- `exportSubscriptions(KV)` - 导出为 JSON
- `importSubscriptions(KV, subscriptions)` - 批量导入

---

### 8. admin/cache.js - 缓存管理

**职责**: 
- 清除 Cloudflare Cache API 中的缓存
- 记录和查询缓存元数据（存储在 KV）
- 提供缓存统计信息

**KV 数据结构**:
```javascript
// 键: cache:meta:github:owner/repo
// 值:
{
    "routeName": "github",
    "param": "owner/repo",
    "cacheTime": 43200,
    "lastAccess": "2025-12-07T10:00:00Z",
    "expiresAt": "2025-12-07T22:00:00Z"
}
```

**核心函数**:
- `clearRouteCache(routeName, param, workerUrl)` - 清除指定缓存
- `clearMultipleCache(routes, workerUrl)` - 批量清除
- `recordCacheMetadata(KV, routeName, param, cacheTime)` - 记录元数据
- `getAllCacheMetadata(KV)` - 获取所有元数据
- `getCacheStats(KV)` - 统计信息

---

## 🔄 数据流程图

### RSS 请求流程

```
用户请求
  ↓
main.js (检查缓存)
  ↓ [缓存未命中]
routers/github.js (抓取数据)
  ↓
rss.js (生成 RSS)
  ↓
main.js (写入缓存 + 记录元数据到 KV)
  ↓
返回响应
```

### 管理后台请求流程

```
用户请求 /admin/api/subscriptions
  ↓
main.js (路由检查)
  ↓
admin/router.js (分发请求)
  ↓
admin/auth.js (验证权限)
  ↓ [通过验证]
admin/subscription.js (业务逻辑)
  ↓
KV (读写数据)
  ↓
admin/router.js (返回 JSON)
  ↓
用户收到响应
```

---

## 🗄️ 数据存储方案

### Cloudflare Cache API
- **用途**: 存储 RSS 响应内容
- **特点**: 边缘缓存、自动过期、无需主动管理
- **限制**: 无法列举所有缓存、只能按 URL 删除

### Cloudflare KV
- **用途**: 存储订阅配置、缓存元数据
- **特点**: 全球分布、最终一致性、支持列举
- **限制**: 写入延迟较高（1-60秒）、最终一致

**为什么不用 D1？**
- 订阅管理是简单的键值存储，无需 SQL
- KV 延迟更低，更适合边缘计算
- 不需要复杂的关联查询

---

## 🚀 部署流程

```bash
# 1. 安装依赖
npm install

# 2. 创建 KV 命名空间
npx wrangler kv:namespace create RSS_KV

# 3. 更新 wrangler.toml
# 填入 KV ID

# 4. 设置管理员密钥
npx wrangler secret put ADMIN_TOKEN

# 5. 部署
npx wrangler deploy

# 6. 测试
curl https://your-worker.workers.dev/?github=owner/repo
curl -H "Authorization: Bearer token" \
  https://your-worker.workers.dev/admin/api/subscriptions
```

---

## 🔧 开发技巧

### 本地开发

```bash
# 启动开发服务器
npx wrangler dev

# 自动热重载
npx wrangler dev --live-reload
```

### 调试技巧

**查看日志**:
```bash
npx wrangler tail
```

**测试 KV 操作**:
```bash
# 写入
npx wrangler kv:key put --binding RSS_KV "test:key" "value"

# 读取
npx wrangler kv:key get --binding RSS_KV "test:key"

# 删除
npx wrangler kv:key delete --binding RSS_KV "test:key"

# 列举
npx wrangler kv:key list --binding RSS_KV --prefix "sub:"
```

**性能分析**:
```javascript
// 在代码中添加计时
const start = Date.now();
await someFunction();
console.log(`耗时: ${Date.now() - start}ms`);
```

---

## 📚 扩展开发

### 添加新路由器

1. 创建 `routers/newplatform.js`:
```javascript
import { itemsToRss } from '../rss.js';

export default async function (params) {
    const { param, format, maxItems } = params;
    // 实现逻辑...
    return { data: rss, isError: false };
}
```

2. 在 `main.js` 中注册:
```javascript
import newplatform from "./routers/newplatform.js";
const funcs = { ..., newplatform };
```

3. 在 `config.js` 中配置缓存:
```javascript
routes: {
    newplatform: {
        success: 3600,
        error: 300,
        maxItems: 20
    }
}
```

### 添加新的管理功能

1. 创建业务模块 `admin/newfeature.js`
2. 在 `admin/router.js` 中添加路由
3. 在前端界面添加对应的 UI

---

## 🎓 参考资源

- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [KV 存储文档](https://developers.cloudflare.com/workers/runtime-apis/kv/)
- [RSS 2.0 规范](https://www.rssboard.org/rss-specification)
- [Atom 规范](https://datatracker.ietf.org/doc/html/rfc4287)
- [JSON Feed 规范](https://www.jsonfeed.org/)

---

**祝开发愉快！如有疑问请查看 ADMIN-GUIDE.md 或 EXAMPLES.md**
