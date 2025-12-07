# 📖 WorkerRSS 程序理解与操作指南

## 🎯 程序概述

**WorkerRSS** 是一个基于 Cloudflare Worker 的多平台 RSS 聚合器，通过 Web 抓取和 API 调用将各种网站内容转换为标准 RSS 格式。

### 🏗️ **核心架构**

```
WorkerRSS/
├── main.js                 # 🚀 主入口文件（请求路由和缓存处理）
├── rss.js                  # 📰 RSS 生成核心工具
├── config.js               # ⚙️ 缓存和项目数量配置（新增）
├── routers/                # 🌐 各平台数据解析器
│   ├── github.js          # GitHub 仓库发布
│   ├── dlsite.js          # DLsite 商品更新  
│   ├── hhkaobo.js         # 弘博考博网招生信息
│   ├── helixlife.js       # 解螺旋课程更新
│   ├── cctv.js            # CCTV 新闻节目
│   ├── telegram.js        # Telegram 频道
│   ├── researchgate.js    # 学术论文发布
│   ├── bilibili.js        # Bilibili 用户视频
│   └── ...                # 其他平台路由器
├── package.json           # 📦 依赖配置
├── wrangler.toml          # ⚙️ Cloudflare Worker 配置
└── README.md              # 📚 项目文档
```

## 🔍 **代码阅读指南**

### **1. 从 main.js 开始理解**

```javascript
// main.js 是整个程序的核心入口
export default {
    async fetch(request) {
        // 1. 解析 URL 参数，确定调用哪个平台路由器
        const url = new URL(request.url)
        const paramName = Array.from(url.searchParams.keys())[0]  // 平台名称
        const paramValue = url.searchParams.get(paramName)        // 平台参数
        
        // 2. 缓存检查 - 避免重复抓取
        const cache = caches.default
        let response = await cache.match(cacheKey)
        if (response) return response  // 缓存命中，直接返回
        
        // 3. 动态调用对应平台的路由器函数
        const func = funcs[paramName]  // 从路由器映射中获取函数
        const rss = await func(paramValue, workerUrl)
        
        // 4. 设置缓存并返回 RSS
        return new Response(rss, { headers: {...} })
    }
}
```

**关键理解点：**
- `paramName` 决定调用哪个平台（如 `github`, `hhkaobo`）
- `paramValue` 是传给平台的具体参数（如仓库名、页码）
- 内置缓存机制，通过 config.js 精细控制每个路由的缓存时间
- 新增 maxItems 参数控制每个路由返回的最大 RSS 条目数量，避免 Cloudflare Worker 超时

### **2. config.js 配置系统（新增）**

```javascript
// config.js 集中管理所有路由的缓存和项目数量配置
export const cacheConfig = {
    default: {
        success: 28800,  // 默认成功缓存 8 小时
        error: 600,      // 默认错误缓存 10 分钟
        maxItems: 30,    // 默认最大返回 30 条
    },
    routes: {
        github: {
            success: 43200,  // GitHub 缓存 12 小时
            error: 1800,     // 错误缓存 30 分钟
            maxItems: 15,    // 最多返回 15 条
        },
        // 其他路由配置...
    }
};
```

**关键理解点：**
- **缓存控制**：区分成功和失败情况的缓存时间，避免错误信息长时间缓存
- **项目数量限制**：通过 `maxItems` 防止一次性获取过多数据导致超时
- **灵活配置**：每个路由可独立配置，未配置的路由使用默认值

### **3. 路由器模式分析**

每个路由器现在遵循统一的模式：

```javascript
// routers/example.js
export default async function (params) {
    const { param, format, maxItems } = params;
    
    try {
        // 获取数据...
        const items = await fetchData();
        
        // 限制条目数量
        const limitedItems = items.slice(0, maxItems);
        
        // 生成 RSS
        const rss = itemsToRss(limitedItems, channel, format);
        
        return { data: rss, isError: false };
    } catch (error) {
        // 错误处理
        const errorItems = [...];
        return { data: itemsToRss(errorItems, channel, format), isError: true };
    }
}
```

**关键理解点：**
- **参数传递**：通过 `params` 对象统一传递 `param`、`format` 和 `maxItems`
- **数量限制**：使用 `slice(0, maxItems)` 确保不超过配置的最大条目数
- **错误处理**：返回 `{ data, isError }` 对象，由 main.js 根据 config.js 设置缓存
- **独立性**：每个路由器独立修改，不影响其他路由

### **⚠️ Bilibili 路由器特殊说明**

**当前状态：** 由于 Bilibili 对 Cloudflare Workers 的 IP 地址有限制，该路由器无法正常工作。

**技术背景：**
- 本地测试确认 Bilibili API 可以正常访问（使用 10 秒延迟避免限速）
- 在 Cloudflare Workers 环境中返回 412 "Precondition Failed" 错误
- 表明 Bilibili 在服务器层面屏蔽了 Cloudflare Workers 的 IP 范围

**用户体验：**
- 路由器返回友好的错误说明，包含替代访问方案
- 提供直接访问 Bilibili 用户空间的链接
- 说明技术限制并建议替代方案

**未来解决方案：**
- 考虑使用代理服务器绕过 IP 限制
- 或者迁移到其他支持访问 Bilibili 的托管平台
- 或者等待 Bilibili 调整其 IP 屏蔽策略

### **📱 Telegram 路由器说明**

**支持的 Telegram 内容类型：**

1. **频道 (Channel)**:
   - **格式**: `频道名` (如: `LifeAnaTech`)
   - **URL**: `https://t.me/s/频道名`
   - **特点**: 单向广播，公开可订阅

2. **群组 (Group)**:
   - **格式**: `+群组ID` (如: `+ABC123def456`)
   - **URL**: `https://t.me/+群组ID`
   - **特点**: 双向对话，可能需要邀请链接

3. **机器人 (Bot)**:
   - **格式**: `机器人名` (如: `BotFather`)
   - **URL**: `https://t.me/s/机器人名`
   - **特点**: 自动化交互

**使用示例：**
```
?telegram=LifeAnaTech          # 频道
?telegram=+ABC123def456        # 群组
?telegram=BotFather           # 机器人
```

**注意事项：**
- 群组内容可能无法公开访问（需要邀请）
- 机器人可能没有消息历史
- 频道消息按时间倒序显示（最新的在前面）

### **3. 数据解析技术栈**

程序使用两种主要的内容解析技术：

#### **🔧 Cheerio（推荐）- 用于 HTML 解析**
```javascript
import * as cheerio from "cheerio"

// 加载 HTML 并使用 CSS 选择器
const $ = cheerio.load(html)
const items = $('.news-item').map((i, el) => {
    return {
        title: $(el).find('.title').text(),
        link: $(el).find('a').attr('href'),
        description: $(el).find('.content').html()
    }
}).get()
```

#### **📝 正则表达式（逐步淘汰）- 用于简单文本处理**
```javascript
// 仅用于简单的文本提取和清理
const titleMatch = text.match(/^(.+?大学|.+?学院)/)
const cleanContent = rawHtml.replace(/<script.*?<\/script>/gi, '')
```

### **4. RSS 生成机制**

**rss.js** 是所有路由器的共享工具：

```javascript
export function itemsToRss(items, channel) {
    // items: RSS 条目数组，每个条目包含：
    // - title: 标题
    // - link: 链接  
    // - description: 描述（支持 HTML）
    // - author: 作者
    // - pubDate: 发布时间
    // - enclosure: 附件（图片/音频）
    
    // channel: RSS 频道信息
    // - title: 频道标题
    // - description: 频道描述
    // - link: 频道链接
    // - image: 频道图标
}
```

## 🛠️ **操作指南**

### **如何阅读现有路由器**

1. **确定数据源类型：**
   - API 类型：`github.js`, `helixlife.js`（直接调用 JSON API）
   - HTML 类型：`hhkaobo.js`, `cctv.js`（解析网页内容）
   - 混合类型：`telegram.js`（HTML + 图片处理）

2. **分析解析逻辑：**
   ```javascript
   // 找到核心解析代码
   const $ = cheerio.load(html)                    // 加载 HTML
   $('.selector').each((i, el) => { ... })        // 遍历元素
   const title = $(el).find('.title').text()      // 提取数据
   ```

3. **理解错误处理：**
   ```javascript
   try {
       // 主要解析逻辑
   } catch (error) {
       // 生成包含错误信息的 RSS，而不是抛出异常
       return itemsToRss(errorItems, errorChannel)
   }
   ```

### **如何修改现有路由器**

1. **修改解析规则：**
   ```javascript
   // 原来
   const title = $('.old-selector').text()
   
   // 修改为
   const title = $('.new-selector').text() || '默认标题'
   ```

2. **添加新字段：**
   ```javascript
   const newsItem = {
       title: title,
       link: link,
       description: description,
       // 新增字段
       category: category,          // 新分类
       thumbnail: thumbnail,        // 新缩略图
       pubDate: pubDate
   }
   ```

3. **调整缓存时间：**
   ```javascript
   // 在 main.js 中修改
   "Cache-Control": "public, max-age=30000"  // 8小时
   // 改为
   "Cache-Control": "public, max-age=3600"   // 1小时
   ```

### **如何添加新平台路由器**

1. **创建路由器文件：**
   ```javascript
   // routers/newsite.js
   import { itemsToRss } from "../rss.js"
   import * as cheerio from "cheerio"
   
   export async function newsite(paramValue, workerUrl) {
       // 实现解析逻辑
   }
   ```

2. **在 main.js 中注册：**
   ```javascript
   import { newsite } from "./routers/newsite.js"
   
   const funcs = { 
       dlsite, github, kemono, 
       newsite,  // 添加新路由器
       // ... 其他路由器
   }
   ```

3. **测试新路由器：**
   ```
   https://your-worker.workers.dev/?newsite=test-param
   ```

### **如何优化性能**

1. **使用 Cheerio 替代正则表达式：**
   ```javascript
   // ❌ 脆弱的正则表达式
   const regex = /<div class="title">([^<]+)<\/div>/g
   
   // ✅ 可靠的 CSS 选择器
   const $ = cheerio.load(html)
   const title = $('.title').text()
   ```

2. **实现错误处理：**
   ```javascript
   try {
       const content = await fetchArticleContent(url)
   } catch (error) {
       console.log(`Error: ${error.message}`)
       return null  // 优雅降级
   }
   ```

3. **控制内容大小：**
   ```javascript
   if (content.length > 3000) {
       content = content.substring(0, 3000) + '...'
   }
   ```

## 🚀 **部署和调试**

### **本地开发**
```bash
npx wrangler dev      # 启动本地开发服务器
```

### **部署到 Cloudflare**
```bash
npx wrangler deploy   # 部署到生产环境
```

### **调试技巧**

1. **使用 raw 参数查看原始内容：**
   ```
   https://worker.dev/?raw=https://target-site.com
   ```

2. **检查缓存状态：**
   ```javascript
   // 查看响应头
   X-Cache-Status: HIT/MISS    // 缓存命中状态
   X-Generated-At: timestamp   // 生成时间
   ```

3. **查看控制台日志：**
   ```bash
   npx wrangler tail    # 实时查看 Worker 日志
   ```

## ⚠️ **注意事项**

1. **反爬虫应对：**
   - 使用真实的 User-Agent
   - 设置适当的请求头
   - 避免过于频繁的请求

2. **错误处理原则：**
   - 永远返回有效的 RSS，即使出错
   - 在 RSS 中包含错误信息
   - 提供手动访问的替代方案
   - 非常重要，换行使用br，而不是\n，这点非常重要。

3. **内容长度控制：**
   - RSS 描述建议不超过 3000 字符
   - 大图片使用代理 URL
   - 避免包含过多的 HTML

4. **缓存策略：**
   - RSS 内容缓存 8 小时
   - 静态内容（如图片）缓存 1 小时
   - 错误响应不要设置长时间缓存

## 🚀 **最新改进思路**

- **精细化控制**：通过 `config.js` 实现对每个路由缓存时间和最大项目数量的独立配置
- **性能优化**：`maxItems` 限制防止 Cloudflare Worker 运行超时
- **统一架构**：所有路由使用相同的参数传递和返回格式，便于维护和扩展
- **错误隔离**：错误情况使用较短缓存时间，避免影响用户体验
- **模块化导出**：所有路由器统一使用 `export default async function (params)` 模式

这个指南应该能帮助后续的 AI 快速理解和操作这个 WorkerRSS 项目。记住：每个路由器都是独立的，修改一个不会影响其他的。