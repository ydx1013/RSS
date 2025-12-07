# 🌐 RSSWorker

**RSSWorker** 是一个基于 Cloudflare Worker 的 RSS 生成工具。它通过访问网页或调用 API，将内容转换为标准 RSS，可自部署使用。

## ⚙️ 功能原理
- 🌍 访问网页或调用各平台 API
- 📝 解析内容（文字、图片、链接等）
- 📡 生成 RSS feed

## 💻 支持的平台
- **GitHub**  
  示例链接: [https://worker_rss.ydxu.workers.dev/?github=4evergr8/atoolbox](https://worker_rss.ydxu.workers.dev/?github=4evergr8/atoolbox)
- **DLsite**  
  示例链接: [https://worker_rss.ydxu.workers.dev/?dlsite=RG51931](https://worker_rss.ydxu.workers.dev/?dlsite=RG51931)
- **Kemono**  
  示例链接: [https://worker_rss.ydxu.workers.dev/?kemono=fanbox/user/3316400](https://worker_rss.ydxu.workers.dev/?kemono=fanbox/user/3316400)
- **Cospuri**  
  示例链接: [https://worker_rss.ydxu.workers.dev/?cospuri=ria-kurumi](https://worker_rss.ydxu.workers.dev/?cospuri=ria-kurumi)
- **Javbus**  
  示例链接: [https://worker_rss.ydxu.workers.dev/?javbus=vbt](https://worker_rss.ydxu.workers.dev/?javbus=vbt)
- **Telegram**  
  示例链接: [https://worker_rss.ydxu.workers.dev/?telegram=durov](https://worker_rss.ydxu.workers.dev/?telegram=durov)
- **ResearchGate** ⚠️  
  示例链接: [https://worker_rss.ydxu.workers.dev/?researchgate=Xinwang-Yang](https://worker_rss.ydxu.workers.dev/?researchgate=Xinwang-Yang)  
  _注意：ResearchGate 有严格的反爬虫保护，可能无法正常访问_
- **CCTV 新闻联播** 📺  
  示例链接: [https://worker_rss.ydxu.workers.dev/?cctv=xwlb](https://worker_rss.ydxu.workers.dev/?cctv=xwlb)  
  _支持多个节目：xwlb(新闻联播)、xwzk(新闻直播间)、hjzs(焦点访谈)_
- **解螺旋(HelixLife)** 🧬  
  示例链接: [https://worker_rss.ydxu.workers.dev/?helixlife=1](https://worker_rss.ydxu.workers.dev/?helixlife=1)  
  _临床医生科研成长平台的课程更新，包含课程标题、讲师、价格、评分等信息_
- **弘博考博网** 🎓  
  示例链接: [https://worker_rss.ydxu.workers.dev/?hhkaobo=1](https://worker_rss.ydxu.workers.dev/?hhkaobo=1)  
  _博士研究生招生简章汇总，支持分页查看(如?hhkaobo=2获取第2页)_

## 🚀 自部署
[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/4evergr8/WorkerRSS/)

1. 📦 将项目部署到 Cloudflare Worker
2. 🔧 配置访问 URL
3. 📰 使用平台参数生成 RSS
4. 🎛️ **[可选]** 配置管理后台 - 参见 [管理后台文档](./ADMIN-GUIDE.md)

### 管理后台快速开始

本项目包含完整的 Web 管理后台，支持订阅管理、缓存控制、数据统计等功能。

```bash
# 1. 创建 KV 命名空间
npx wrangler kv:namespace create RSS_KV

# 2. 更新 wrangler.toml 中的 KV ID 和 ADMIN_TOKEN

# 3. 部署
npx wrangler deploy

# 4. 访问管理后台
# https://your-worker.workers.dev/admin?token=your-token
```

**功能特性：**
- 📚 订阅管理：添加、编辑、删除、导入导出
- 💾 缓存管理：查看统计、清除缓存
- 📊 数据统计：订阅分布、平台统计
- 🔐 安全认证：Bearer Token 和 Basic Auth
- 🎨 现代界面：响应式设计，支持移动端

详细配置和 API 文档请查看 **[📖 管理后台完整文档](./ADMIN-GUIDE.md)**

---

## 📝 注意事项
- **ResearchGate**: 由于反爬虫保护，可能返回错误页面，建议手动访问
- **CCTV**: 解析央视新闻节目，包含视频缩略图、时长等信息
- **其他平台**: 大多数支持 API 请求，少数需要解析网页

## 💡 添加新网站
1. 使用 `raw` 参数测试目标网址是否有风控
2. 分析网页结构或 API 接口
3. 参考现有路由器代码实现新功能

我一直认为 RSS 属于那种"不是每天都看，但是偶尔会去确认一下"的内容  
迫于 RSSHub 没有我想要的网站，也没找到可靠的节点，又不想自己花钱买服务器，就整了这个，写到一半发现已经有成熟的实现了😅，只能硬着头皮写完了