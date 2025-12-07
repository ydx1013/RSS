# 🎯 WorkerRSS 后台管理系统

## 📋 系统架构

本系统为 WorkerRSS 添加了完整的后台管理功能，包括：

- **🔐 认证系统**: 支持 Bearer Token 和 Basic Auth 双重认证
- **📚 订阅管理**: 添加、编辑、删除、导入导出订阅
- **💾 缓存管理**: 查看缓存统计、清除缓存、管理元数据
- **📊 数据统计**: 实时监控订阅数量、平台分布、缓存状态
- **🎨 可视化界面**: 现代化响应式 Web 界面

## 🗄️ 数据存储方案：KV vs D1

### ✅ 推荐使用 **Cloudflare Workers KV**

#### 为什么选择 KV？

| 特性 | KV | D1 | 分析 |
|------|----|----|------|
| **延迟** | < 10ms | 50-200ms | ✅ RSS 需要快速响应 |
| **访问模式** | 键值读写 | SQL 查询 | ✅ 订阅管理主要是简单 CRUD |
| **一致性** | 最终一致 | 强一致 | ✅ RSS 订阅容忍短暂不一致 |
| **免费额度** | 10万读/天 | 500万行读/天 | ✅ KV 对个人使用足够 |
| **复杂度** | 极简 API | SQL + 迁移 | ✅ KV 更易维护 |
| **边缘缓存** | 原生支持 | 需手动实现 | ✅ 与现有缓存策略一致 |

#### KV 数据结构设计

```
# 订阅数据
sub:{id} → {
  "id": "github_owner/repo",
  "name": "项目名称",
  "platform": "github",
  "tags": ["tech", "news"],
  "note": "备注",
  "createdAt": "2025-12-07T10:00:00Z",
  "updatedAt": "2025-12-07T12:00:00Z"
}

# 缓存元数据
cache:meta:{routeName}:{param} → {
  "routeName": "github",
  "param": "owner/repo",
  "cacheTime": 43200,
  "lastAccess": "2025-12-07T10:00:00Z",
  "expiresAt": "2025-12-07T22:00:00Z"
}
```

#### 何时应该用 D1？

如果你的需求包括以下场景，才考虑升级到 D1：

- ✅ 多表关联查询（用户-订阅-分类-标签的复杂关系）
- ✅ 复杂统计分析（"过去30天点击量最高的订阅"）
- ✅ 事务保证（同时更新多个相关记录）
- ✅ 订阅数量 > 10,000 条（KV 列举变慢）

**对于当前项目，KV 是最优选择。**

---

## 🚀 快速开始

### 1️⃣ 创建 KV 命名空间

```bash
# 创建生产环境 KV
npx wrangler kv:namespace create RSS_KV

# 创建预览环境 KV（用于本地开发）
npx wrangler kv:namespace create RSS_KV --preview
```

输出示例：
```
✨ Success! Created KV namespace RSS_KV
id: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
```

### 2️⃣ 更新 wrangler.toml

将上述 ID 填入配置文件：

```toml
[[kv_namespaces]]
binding = "RSS_KV"
id = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"  # 替换为你的实际 ID
preview_id = "your-preview-kv-id"        # 预览环境 ID

[vars]
ADMIN_TOKEN = "your-secure-random-token-32chars"  # 生成强随机 Token
```

**⚠️ 安全提示**: 生成强随机 Token 的方法：

```bash
# Linux/Mac
openssl rand -base64 32

# PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 3️⃣ 本地测试

```bash
# 启动本地开发服务器
npx wrangler dev

# 访问管理后台
# http://localhost:8787/admin?token=your-secure-random-token-32chars
```

### 4️⃣ 部署到生产环境

```bash
# 部署到 Cloudflare Workers
npx wrangler deploy

# 访问管理后台
# https://worker_rss.your-subdomain.workers.dev/admin?token=your-token
```

---

## 🔐 认证方式

### 方式 1: Bearer Token（推荐 API 调用）

```bash
curl -H "Authorization: Bearer your-token" \
  https://your-worker.workers.dev/admin/api/subscriptions
```

### 方式 2: Basic Auth（推荐浏览器）

在 `wrangler.toml` 中配置：

```toml
[vars]
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "secure-password"
```

浏览器会自动弹出登录框。

### 方式 3: URL 参数（快速访问）

```
https://your-worker.workers.dev/admin?token=your-token
```

⚠️ **注意**: URL 参数方式不够安全，仅用于临时访问或受信任环境。

---

## 📚 API 接口文档

### 订阅管理

#### 获取所有订阅
```http
GET /admin/api/subscriptions
Authorization: Bearer {token}

Response:
{
  "success": true,
  "data": [
    {
      "id": "github_owner/repo",
      "name": "项目名称",
      "platform": "github",
      "tags": ["tech"],
      "createdAt": "2025-12-07T10:00:00Z"
    }
  ]
}
```

#### 搜索订阅
```http
GET /admin/api/subscriptions?q=github
Authorization: Bearer {token}
```

#### 创建订阅
```http
POST /admin/api/subscriptions
Authorization: Bearer {token}
Content-Type: application/json

{
  "id": "github_owner/repo",
  "name": "项目名称",
  "platform": "github",
  "tags": ["tech", "news"],
  "note": "备注信息"
}
```

#### 更新订阅
```http
PUT /admin/api/subscriptions/{id}
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "新名称",
  "tags": ["updated"]
}
```

#### 删除订阅
```http
DELETE /admin/api/subscriptions/{id}
Authorization: Bearer {token}
```

#### 导出订阅
```http
GET /admin/api/subscriptions/export
Authorization: Bearer {token}

Response:
{
  "version": "1.0",
  "exportedAt": "2025-12-07T10:00:00Z",
  "count": 10,
  "subscriptions": [...]
}
```

#### 导入订阅
```http
POST /admin/api/subscriptions/import
Authorization: Bearer {token}
Content-Type: application/json

{
  "subscriptions": [
    { "id": "...", "name": "...", ... }
  ]
}

Response:
{
  "success": 5,
  "failed": 0,
  "errors": []
}
```

#### 订阅统计
```http
GET /admin/api/subscriptions/stats
Authorization: Bearer {token}

Response:
{
  "success": true,
  "data": {
    "total": 25,
    "byPlatform": {
      "github": 10,
      "bilibili": 8,
      "telegram": 7
    },
    "recentlyAdded": [...],
    "recentlyUpdated": [...]
  }
}
```

### 缓存管理

#### 清除单个缓存
```http
POST /admin/api/cache/clear
Authorization: Bearer {token}
Content-Type: application/json

{
  "routeName": "github",
  "param": "owner/repo"
}

Response:
{
  "success": true,
  "clearedCount": 3,
  "message": "已清除 3 个缓存条目"
}
```

#### 批量清除缓存
```http
POST /admin/api/cache/clear
Authorization: Bearer {token}
Content-Type: application/json

{
  "routes": [
    { "routeName": "github", "param": "owner/repo1" },
    { "routeName": "bilibili", "param": "123456" }
  ]
}
```

#### 获取缓存元数据
```http
GET /admin/api/cache/metadata
Authorization: Bearer {token}

Response:
{
  "success": true,
  "total": 50,
  "items": [
    {
      "key": "github:owner/repo",
      "routeName": "github",
      "param": "owner/repo",
      "lastAccess": "2025-12-07T10:00:00Z",
      "expiresAt": "2025-12-07T22:00:00Z"
    }
  ]
}
```

#### 缓存统计
```http
GET /admin/api/cache/stats
Authorization: Bearer {token}

Response:
{
  "success": true,
  "data": {
    "total": 50,
    "byRoute": {
      "github": 20,
      "bilibili": 15
    },
    "recentAccess": [...],
    "soonToExpire": [...]
  }
}
```

#### 清理过期元数据
```http
POST /admin/api/cache/clean
Authorization: Bearer {token}

Response:
{
  "success": true,
  "cleaned": 5,
  "message": "已清理 5 个过期缓存元数据"
}
```

### 系统信息

```http
GET /admin/api/system/info
Authorization: Bearer {token}

Response:
{
  "success": true,
  "data": {
    "version": "1.0.0",
    "worker": "https://your-worker.workers.dev",
    "timestamp": "2025-12-07T10:00:00Z",
    "env": {
      "hasKV": true,
      "hasAuth": true
    }
  }
}
```

---

## 🎨 Web 界面使用

### 仪表盘
- 📊 实时统计：订阅总数、缓存条目、平台分布
- 📈 最近活动：新增订阅、更新记录

### 订阅管理
- ➕ 添加订阅：填写 ID、名称、平台、标签
- 🔍 搜索订阅：按关键词快速查找
- 📥 导出订阅：JSON 格式备份
- 📤 导入订阅：批量恢复订阅
- 🗑️ 删除订阅：一键移除

### 缓存管理
- 📊 缓存统计：按路由查看缓存分布
- 🗑️ 清除缓存：单个或批量清除
- 🧹 清理元数据：移除过期记录

### 系统设置
- 📄 API 文档：内置完整接口说明
- 🔧 系统信息：版本、配置状态

---

## 💡 使用场景示例

### 场景 1: 批量添加订阅

1. 准备 JSON 文件 `subscriptions.json`:

```json
{
  "subscriptions": [
    {
      "id": "github_microsoft/vscode",
      "name": "VS Code",
      "platform": "github",
      "tags": ["editor", "development"]
    },
    {
      "id": "github_facebook/react",
      "name": "React",
      "platform": "github",
      "tags": ["frontend", "javascript"]
    }
  ]
}
```

2. 通过 Web 界面导入或使用 API:

```bash
curl -X POST https://your-worker.workers.dev/admin/api/subscriptions/import \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d @subscriptions.json
```

### 场景 2: 定期备份订阅

```bash
#!/bin/bash
# backup.sh

TOKEN="your-token"
WORKER_URL="https://your-worker.workers.dev"
BACKUP_DIR="./backups"
DATE=$(date +%Y-%m-%d)

mkdir -p "$BACKUP_DIR"

curl -H "Authorization: Bearer $TOKEN" \
  "$WORKER_URL/admin/api/subscriptions/export" \
  > "$BACKUP_DIR/subscriptions-$DATE.json"

echo "备份完成: subscriptions-$DATE.json"
```

### 场景 3: 清除特定平台的所有缓存

```javascript
// clear-cache.js
const TOKEN = 'your-token';
const WORKER_URL = 'https://your-worker.workers.dev';

async function clearGitHubCaches() {
    // 1. 获取所有 GitHub 订阅
    const res = await fetch(`${WORKER_URL}/admin/api/subscriptions?q=github`, {
        headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    const { data } = await res.json();
    
    // 2. 批量清除缓存
    const routes = data.map(sub => ({
        routeName: 'github',
        param: sub.id.replace('github_', '')
    }));
    
    const clearRes = await fetch(`${WORKER_URL}/admin/api/cache/clear`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ routes })
    });
    
    console.log(await clearRes.json());
}

clearGitHubCaches();
```

---

## 🔒 安全最佳实践

1. **使用强随机 Token**: 至少 32 字符，包含字母数字和符号
2. **使用 Secrets 而非环境变量**: 生产环境使用 `wrangler secret put ADMIN_TOKEN`
3. **定期轮换密钥**: 建议每 90 天更换一次
4. **限制访问来源**: 在 Cloudflare Dashboard 中配置 IP 白名单
5. **启用 HTTPS Only**: Workers 默认强制 HTTPS
6. **监控访问日志**: 定期检查异常访问

### 生产环境密钥配置

```bash
# 不要在 wrangler.toml 中写明文密钥！
# 使用 Secrets 功能：
npx wrangler secret put ADMIN_TOKEN
# 输入密钥后回车

npx wrangler secret put ADMIN_PASSWORD
# 输入密码后回车
```

---

## 🐛 故障排除

### KV 命名空间绑定失败

**错误**: `KV namespace not configured`

**解决**:
1. 确认 `wrangler.toml` 中 `binding = "RSS_KV"` 名称与代码一致
2. 检查 KV ID 是否正确
3. 重新部署: `npx wrangler deploy`

### 认证失败 401

**错误**: `Unauthorized`

**解决**:
1. 检查 Token 是否正确
2. 确认环境变量已设置: `npx wrangler secret list`
3. 使用 URL 参数测试: `?token=your-token`

### 缓存元数据不显示

**原因**: 缓存元数据需要在 RSS 请求时自动记录

**解决**: 访问几个 RSS 路由后再查看缓存管理页面

---

## 📈 性能优化建议

### KV 使用优化

1. **批量操作**: 使用 `Promise.all()` 并行读取多个订阅
2. **缓存过期**: 设置合理的 `expirationTtl` 避免无限增长
3. **列举限制**: 订阅数量 > 1000 时考虑分页

### 缓存策略

1. **热数据优先**: 高频访问的路由使用更长缓存时间
2. **错误快速重试**: 失败的请求使用短缓存（config.js 中已配置）
3. **强制刷新**: 提供 `?refresh` 参数绕过缓存

---

## 🛠️ 扩展开发

### 添加新的管理功能

1. 在 `admin/` 目录创建新模块（如 `admin/analytics.js`）
2. 在 `admin/router.js` 中添加路由处理
3. 在 Web 界面添加对应的 UI 和 JavaScript 调用

### 自定义数据模型

修改 `admin/subscription.js` 中的数据结构：

```javascript
const subscription = {
    ...data,
    // 添加自定义字段
    category: data.category || 'default',
    priority: data.priority || 0,
    lastCheck: new Date().toISOString()
};
```

### 集成外部服务

例如将订阅同步到 Notion:

```javascript
// admin/integrations/notion.js
export async function syncToNotion(subscriptions, notionToken) {
    // 实现 Notion API 集成
}
```

---

## 📄 许可证

MIT License - 详见项目根目录 LICENSE 文件

## 🙋 支持与反馈

- GitHub Issues: https://github.com/yourusername/WorkerRSS/issues
- 文档站点: https://your-docs-site.com
- Email: your-email@example.com
