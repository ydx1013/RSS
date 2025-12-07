# 📝 WorkerRSS 后台管理 - 快速使用示例

## 🎯 5 分钟快速上手

### 1. 一键部署

**Windows 用户:**
```powershell
# 在项目根目录执行
.\deploy.ps1
```

**Linux/Mac 用户:**
```bash
# 赋予执行权限
chmod +x deploy.sh

# 执行部署
./deploy.sh
```

脚本会自动完成：
- ✅ 创建 KV 命名空间
- ✅ 生成安全 Token
- ✅ 配置 wrangler.toml
- ✅ 部署到 Cloudflare Workers
- ✅ 输出访问地址和凭据

### 2. 访问管理后台

部署完成后，访问输出的管理后台地址（带 token 参数）：

```
https://your-worker.workers.dev/admin?token=your-generated-token
```

### 3. 添加第一个订阅

在管理后台点击 **"订阅管理"** → **"添加订阅"**：

- **订阅 ID**: `github_microsoft/vscode`
- **名称**: `VS Code 发布`
- **平台**: `github`
- **标签**: `editor, development`

保存后，你就可以通过以下地址访问 RSS：

```
https://your-worker.workers.dev/?github=microsoft/vscode
```

---

## 💡 常见使用场景

### 场景 1: 监控多个 GitHub 项目发布

```javascript
// 使用脚本批量添加
const subscriptions = [
    { id: "github_microsoft/vscode", name: "VS Code", platform: "github", tags: ["editor"] },
    { id: "github_facebook/react", name: "React", platform: "github", tags: ["frontend"] },
    { id: "github_vuejs/core", name: "Vue", platform: "github", tags: ["frontend"] }
];

// 通过 API 导入
fetch('https://your-worker.workers.dev/admin/api/subscriptions/import', {
    method: 'POST',
    headers: {
        'Authorization': 'Bearer your-token',
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ subscriptions })
});
```

### 场景 2: 每日自动备份订阅数据

**Windows 计划任务脚本 (backup.ps1):**

```powershell
$TOKEN = "your-token"
$WORKER_URL = "https://your-worker.workers.dev"
$BACKUP_DIR = "C:\Backups\RSS"
$DATE = Get-Date -Format "yyyy-MM-dd"

if (!(Test-Path $BACKUP_DIR)) {
    New-Item -ItemType Directory -Path $BACKUP_DIR
}

Invoke-RestMethod -Uri "$WORKER_URL/admin/api/subscriptions/export" `
    -Headers @{ "Authorization" = "Bearer $TOKEN" } `
    -OutFile "$BACKUP_DIR\subscriptions-$DATE.json"

Write-Host "备份完成: subscriptions-$DATE.json"
```

添加到任务计划：
```powershell
$action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-File C:\Scripts\backup.ps1"
$trigger = New-ScheduledTaskTrigger -Daily -At 2AM
Register-ScheduledTask -TaskName "RSS订阅备份" -Action $action -Trigger $trigger
```

### 场景 3: 清除失效缓存

当某个 RSS 源更新后，强制刷新缓存：

```javascript
// clear-cache.js
const axios = require('axios');

async function clearCache(routeName, param) {
    const response = await axios.post(
        'https://your-worker.workers.dev/admin/api/cache/clear',
        { routeName, param },
        { headers: { 'Authorization': 'Bearer your-token' } }
    );
    console.log(response.data);
}

// 清除 GitHub microsoft/vscode 的缓存
clearCache('github', 'microsoft/vscode');
```

### 场景 4: 监控订阅统计

获取每日订阅数据变化：

```python
# monitor.py
import requests
from datetime import datetime

TOKEN = "your-token"
WORKER_URL = "https://your-worker.workers.dev"

headers = {"Authorization": f"Bearer {TOKEN}"}

# 获取订阅统计
stats_response = requests.get(f"{WORKER_URL}/admin/api/subscriptions/stats", headers=headers)
stats = stats_response.json()

# 获取缓存统计
cache_response = requests.get(f"{WORKER_URL}/admin/api/cache/stats", headers=headers)
cache_stats = cache_response.json()

print(f"[{datetime.now()}]")
print(f"总订阅数: {stats['data']['total']}")
print(f"总缓存数: {cache_stats['data']['total']}")
print(f"平台分布: {stats['data']['byPlatform']}")
```

---

## 🔧 进阶配置

### 自定义缓存策略

编辑 `config.js` 调整各平台的缓存时间：

```javascript
// 将 GitHub 缓存时间从 12 小时改为 6 小时
github: {
    success: 21600,  // 6 小时 = 21600 秒
    error: 1800,
    maxItems: 15,
}
```

### 使用环境变量管理多个实例

```toml
# wrangler.toml
[env.production]
name = "worker_rss_prod"
vars = { INSTANCE_NAME = "Production" }

[env.staging]
name = "worker_rss_staging"
vars = { INSTANCE_NAME = "Staging" }
```

部署到不同环境：
```bash
npx wrangler deploy --env production
npx wrangler deploy --env staging
```

### 集成 RSS 阅读器

推荐的 RSS 阅读器配置：

**Feedly:**
1. 添加新源 → 输入 RSS URL
2. 支持多格式：RSS、Atom、JSON Feed

**Inoreader:**
- 支持自定义刷新频率
- 建议设置为与缓存时间匹配

**自建 RSS 聚合器 (Miniflux/FreshRSS):**
```sql
-- 批量导入订阅（PostgreSQL 示例）
INSERT INTO feeds (feed_url, title, category_id) VALUES
('https://your-worker.workers.dev/?github=microsoft/vscode', 'VS Code', 1),
('https://your-worker.workers.dev/?github=facebook/react', 'React', 1);
```

---

## 📊 仪表盘功能说明

### 统计卡片

- **总订阅数**: 所有已添加的 RSS 订阅总数
- **缓存条目**: 当前活跃的缓存数量
- **平台数量**: 订阅覆盖的平台种类
- **系统状态**: Worker 运行状态

### 最近活动

显示最近 5 条订阅变更记录，包括：
- 新增订阅
- 更新订阅
- 删除订阅

### 订阅管理

**搜索功能**: 支持按 ID、名称、平台、标签搜索

**批量操作**:
- 导出：下载 JSON 格式备份
- 导入：从备份恢复订阅

**单个操作**:
- 编辑：修改订阅信息
- 删除：移除订阅（不影响 RSS 访问）

### 缓存管理

**缓存统计**: 按路由查看缓存分布

**缓存列表**: 显示最近 20 条缓存记录，包括：
- 路由名称
- 参数值
- 最后访问时间
- 过期时间

**清理操作**:
- 单个清除：删除特定路由的缓存
- 批量清除：清除多个路由缓存
- 清理过期：移除已过期的元数据

---

## 🐛 常见问题

### Q1: 忘记管理员 Token 怎么办？

**方法 1**: 查看 Cloudflare Dashboard
```
Workers & Pages → worker_rss → Settings → Variables → ADMIN_TOKEN
```

**方法 2**: 重新生成并更新
```bash
# 生成新 Token
openssl rand -base64 32

# 更新 Secret
npx wrangler secret put ADMIN_TOKEN
```

### Q2: 订阅删除后 RSS 还能访问吗？

**能**。订阅管理只是方便记录，不影响 RSS 路由的实际功能。删除订阅不会删除 RSS 数据。

### Q3: 缓存管理中看不到数据？

缓存元数据是在 RSS 请求时自动记录的。访问几个 RSS 路由后再查看。

### Q4: 如何限制只能从特定 IP 访问管理后台？

在 Cloudflare Dashboard 中配置防火墙规则：
```
Workers & Pages → worker_rss → Settings → Triggers → Add Custom Domain
然后在 Security → WAF → Create rule:
(http.request.uri.path matches "/admin.*" and ip.src ne YOUR_IP) then Block
```

### Q5: 本地开发如何测试？

```bash
# 启动本地开发服务器
npx wrangler dev

# 访问管理后台
http://localhost:8787/admin?token=your-token

# 测试 RSS
http://localhost:8787/?github=owner/repo
```

---

## 🎓 学习资源

### Cloudflare Workers 文档
- [Workers 入门](https://developers.cloudflare.com/workers/)
- [KV 存储指南](https://developers.cloudflare.com/workers/runtime-apis/kv/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)

### RSS 规范
- [RSS 2.0 规范](https://www.rssboard.org/rss-specification)
- [Atom 1.0 规范](https://datatracker.ietf.org/doc/html/rfc4287)
- [JSON Feed 规范](https://www.jsonfeed.org/)

### 相关项目
- [RSSHub](https://github.com/DIYgod/RSSHub) - 万物皆可 RSS
- [Miniflux](https://miniflux.app/) - 极简 RSS 阅读器
- [FreshRSS](https://freshrss.org/) - 自托管 RSS 聚合器

---

## 💬 反馈与支持

遇到问题或有建议？

- 📝 提交 Issue: [GitHub Issues](https://github.com/yourusername/WorkerRSS/issues)
- 💬 讨论交流: [GitHub Discussions](https://github.com/yourusername/WorkerRSS/discussions)
- 📧 邮件联系: your-email@example.com

---

## 🙏 致谢

感谢以下开源项目的启发：
- [RSSHub](https://github.com/DIYgod/RSSHub)
- [Cloudflare Workers](https://workers.cloudflare.com/)
- [Cheerio](https://cheerio.js.org/)

---

**祝你使用愉快！如果觉得有用，请给个 ⭐ Star 支持一下！**
