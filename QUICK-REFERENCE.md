# 📋 WorkerRSS 后台管理 - 快速参考

## 🚀 快速命令

### 部署相关
```bash
# 一键部署（Windows）
.\deploy.ps1

# 一键部署（Linux/Mac）
chmod +x deploy.sh && ./deploy.sh

# 手动部署
npx wrangler kv:namespace create RSS_KV
# 编辑 wrangler.toml 填入 KV ID
npx wrangler secret put ADMIN_TOKEN
npx wrangler deploy

# 本地开发
npx wrangler dev
```

### KV 管理
```bash
# 创建命名空间
npx wrangler kv:namespace create RSS_KV
npx wrangler kv:namespace create RSS_KV --preview

# 列举键
npx wrangler kv:key list --binding RSS_KV --prefix "sub:"

# 读取值
npx wrangler kv:key get --binding RSS_KV "sub:github_owner/repo"

# 写入值
npx wrangler kv:key put --binding RSS_KV "test" "value"

# 删除键
npx wrangler kv:key delete --binding RSS_KV "test"
```

### 日志查看
```bash
# 实时日志
npx wrangler tail

# 查看部署历史
npx wrangler deployments list
```

---

## 🔗 URL 速查

### RSS 访问
```
# 基础格式
https://your-worker.workers.dev/?platform=parameter

# 指定格式
https://your-worker.workers.dev/?platform=parameter&format=atom
https://your-worker.workers.dev/?platform=parameter&format=json

# 强制刷新
https://your-worker.workers.dev/?platform=parameter&refresh

# 示例
https://your-worker.workers.dev/?github=microsoft/vscode
https://your-worker.workers.dev/?telegram=durov
https://your-worker.workers.dev/?cctv=xwlb
```

### 管理后台
```
# Web 界面（URL 参数认证）
https://your-worker.workers.dev/admin?token=YOUR_TOKEN

# API 访问（需要 Bearer Token）
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-worker.workers.dev/admin/api/subscriptions
```

---

## 📡 API 快速参考

### 订阅管理
```bash
# 获取所有订阅
GET /admin/api/subscriptions

# 搜索订阅
GET /admin/api/subscriptions?q=github

# 创建订阅
POST /admin/api/subscriptions
Body: {
  "id": "github_owner/repo",
  "name": "名称",
  "platform": "github",
  "tags": ["tag1", "tag2"]
}

# 更新订阅
PUT /admin/api/subscriptions/{id}

# 删除订阅
DELETE /admin/api/subscriptions/{id}

# 导出订阅
GET /admin/api/subscriptions/export

# 导入订阅
POST /admin/api/subscriptions/import
Body: { "subscriptions": [...] }

# 订阅统计
GET /admin/api/subscriptions/stats
```

### 缓存管理
```bash
# 清除单个缓存
POST /admin/api/cache/clear
Body: { "routeName": "github", "param": "owner/repo" }

# 批量清除
POST /admin/api/cache/clear
Body: { "routes": [{"routeName": "...", "param": "..."}] }

# 缓存元数据
GET /admin/api/cache/metadata

# 缓存统计
GET /admin/api/cache/stats

# 清理过期
POST /admin/api/cache/clean
```

### 系统信息
```bash
# 系统状态
GET /admin/api/system/info
```

---

## 🔐 认证方式

### 方式 1: Bearer Token（推荐）
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-worker.workers.dev/admin/api/subscriptions
```

### 方式 2: Basic Auth
```bash
curl -u admin:password \
  https://your-worker.workers.dev/admin/api/subscriptions
```

### 方式 3: URL 参数
```
https://your-worker.workers.dev/admin?token=YOUR_TOKEN
```

---

## ⚙️ 配置文件速查

### wrangler.toml
```toml
name = "worker_rss"
main = "main.js"
compatibility_date = "2025-03-12"

[observability.logs]
enabled = true

[[kv_namespaces]]
binding = "RSS_KV"
id = "YOUR_KV_ID"
preview_id = "YOUR_PREVIEW_KV_ID"

# 不要在这里写明文密钥！使用 Secrets
# [vars]
# ADMIN_TOKEN = "..."  # ❌ 不安全
```

### config.js - 缓存配置
```javascript
routes: {
    platform_name: {
        success: 3600,   // 成功缓存时间（秒）
        error: 300,      // 错误缓存时间（秒）
        maxItems: 20,    // 最大返回条目数
    }
}
```

---

## 🛠️ 常用脚本

### 生成随机 Token
```bash
# Linux/Mac
openssl rand -base64 32

# Windows PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 批量添加订阅
```javascript
// add-subscriptions.js
const subscriptions = [
    { id: "github_microsoft/vscode", name: "VS Code", platform: "github" },
    { id: "github_facebook/react", name: "React", platform: "github" }
];

fetch('https://your-worker.workers.dev/admin/api/subscriptions/import', {
    method: 'POST',
    headers: {
        'Authorization': 'Bearer YOUR_TOKEN',
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ subscriptions })
}).then(r => r.json()).then(console.log);
```

### 定期备份（PowerShell）
```powershell
# backup.ps1
$TOKEN = $env:ADMIN_TOKEN
$URL = "https://your-worker.workers.dev"
$DATE = Get-Date -Format "yyyy-MM-dd"

Invoke-RestMethod -Uri "$URL/admin/api/subscriptions/export" `
    -Headers @{ "Authorization" = "Bearer $TOKEN" } `
    -OutFile "backup-$DATE.json"
```

---

## 🐛 故障排除速查

| 问题 | 解决方案 |
|------|---------|
| `KV namespace not configured` | 检查 wrangler.toml 中的 KV 配置和绑定名称 |
| `Unauthorized (401)` | 检查 Token 是否正确，使用 `npx wrangler secret list` 查看 |
| 缓存元数据为空 | 缓存元数据需要在 RSS 请求时自动记录，先访问几个 RSS |
| 部署后无法访问 | 检查路由是否正确，查看 `npx wrangler tail` 日志 |
| KV 写入延迟 | KV 是最终一致性，等待 1-60 秒后刷新 |
| Token 忘记了 | Cloudflare Dashboard → Workers → Settings → Variables |

---

## 📊 性能优化建议

### 缓存策略
- **高频内容**（新闻、社交）：5-30 分钟
- **中频内容**（视频、博客）：1-4 小时
- **低频内容**（软件发布）：12-24 小时
- **错误状态**：1-10 分钟（快速重试）

### KV 使用优化
```javascript
// ✅ 好：并行读取
const [sub1, sub2] = await Promise.all([
    KV.get('sub:1'),
    KV.get('sub:2')
]);

// ❌ 差：串行读取
const sub1 = await KV.get('sub:1');
const sub2 = await KV.get('sub:2');
```

### 限制返回数量
```javascript
// 在 config.js 中为每个路由设置合理的 maxItems
routes: {
    github: { maxItems: 15 },    // Release 通常不多
    bilibili: { maxItems: 20 },  // 视频列表适中
    telegram: { maxItems: 25 }   // 消息可以多一些
}
```

---

## 📚 支持的平台

| 平台 | 参数示例 | 说明 |
|------|---------|------|
| GitHub | `?github=owner/repo` | 仓库 Releases |
| Bilibili | `?bilibili=user_id` | 用户视频（当前不可用） |
| Telegram | `?telegram=channel` | 频道消息 |
| CCTV | `?cctv=xwlb` | 新闻节目 |
| DLsite | `?dlsite=RG51931` | 商品更新 |
| Kemono | `?kemono=fanbox/user/123` | 创作者作品 |
| ResearchGate | `?researchgate=Name` | 学术论文 |
| 解螺旋 | `?helixlife=1` | 课程更新 |
| 弘博考博 | `?hhkaobo=1` | 招生信息 |

更多平台请查看 `routers/` 目录。

---

## 🎯 下一步行动

### 刚部署完成？
1. ✅ 访问管理后台添加第一个订阅
2. ✅ 测试 RSS 访问是否正常
3. ✅ 将 RSS URL 添加到你的阅读器

### 日常使用？
1. 📚 定期备份订阅数据
2. 💾 查看缓存统计优化性能
3. 🔍 搜索和管理订阅

### 遇到问题？
1. 📖 查看 [ADMIN-GUIDE.md](./ADMIN-GUIDE.md)
2. 🏗️ 查看 [ARCHITECTURE.md](./ARCHITECTURE.md)
3. 💡 查看 [EXAMPLES.md](./EXAMPLES.md)
4. 🐛 提交 GitHub Issue

---

## 📞 获取帮助

- 📖 完整文档: [ADMIN-GUIDE.md](./ADMIN-GUIDE.md)
- 🏗️ 架构说明: [ARCHITECTURE.md](./ARCHITECTURE.md)
- 💡 使用示例: [EXAMPLES.md](./EXAMPLES.md)
- 🐛 问题反馈: [GitHub Issues](https://github.com/yourusername/WorkerRSS/issues)

---

**提示**: 将本文件打印或保存为 PDF，随时查阅！
