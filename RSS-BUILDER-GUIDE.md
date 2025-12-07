# 🔧 WorkerRSS 可视化 RSS 生成器 - 使用指南

## 📖 功能简介

**可视化 RSS 生成器**让你无需编写代码，即可为任何网站创建自定义 RSS 订阅源！

### ✨ 核心特性

- 🔍 **智能检测** - 自动分析网页结构，推荐最佳选择器
- 👁️ **实时预览** - 测试配置立即看到解析结果
- 💾 **永久保存** - 配置保存后生成专属 RSS 地址
- 🎨 **可视化编辑** - 无需懂技术，填表单即可创建
- 🚀 **即刻可用** - 保存后立即可被 RSS 阅读器订阅

---

## 🚀 快速开始

### 步骤 1：访问 RSS 生成器

1. 登录管理后台：`https://your-worker.workers.dev/admin?token=YOUR_TOKEN`
2. 点击顶部导航栏的 **"🔧 RSS 生成器"**

### 步骤 2：输入目标网站

在"目标网页 URL"输入框中输入你想创建 RSS 的网站地址，例如：
```
https://news.ycombinator.com/
https://www.example.com/blog
https://某论坛.com/forum.php?mod=forumdisplay&fid=123
```

### 步骤 3：智能检测（推荐）

点击 **"🔍 智能检测"** 按钮，系统会：
- 自动访问目标网页
- 分析页面结构
- 提取标题、描述等信息
- 推荐最佳选择器
- 自动填充表单

### 步骤 4：手动调整（如需）

如果智能检测的结果不理想，可以手动调整选择器：

#### 必填项：
- **容器选择器** - 每条新闻/文章的容器（如 `article`, `.post`, `.item`）
- **标题选择器** - 标题元素（如 `h2`, `.title`）
- **链接选择器** - 链接元素（通常是 `a`）

#### 可选项：
- **描述选择器** - 内容摘要（如 `p`, `.summary`）
- **作者选择器** - 作者名称（如 `.author`）
- **日期选择器** - 发布日期（如 `time`, `.date`）
- **图片选择器** - 缩略图（如 `img`）

### 步骤 5：测试配置

点击 **"🧪 测试配置"** 按钮：
- 系统会实时抓取网页
- 显示解析出的前 5 条记录
- 展示完整的 RSS XML
- 检查是否有错误

### 步骤 6：保存配置

如果测试通过，填写：
- **配置 ID** - 用于 URL 访问（如 `my-blog-rss`）
- **RSS 标题** - RSS 订阅源的名称
- **RSS 描述** - 简短描述

点击 **"💾 保存配置"**，系统会生成专属 RSS 地址：
```
https://your-worker.workers.dev/?custom=my-blog-rss
```

### 步骤 7：订阅使用

将生成的 RSS 地址添加到你喜欢的 RSS 阅读器中！

---

## 💡 实战案例

### 案例 1：为 Hacker News 创建 RSS

**目标网址**: `https://news.ycombinator.com/`

**选择器配置**:
```
容器选择器: .athing
标题选择器: .titleline > a
标题属性: (留空，取文本)
链接选择器: .titleline > a
链接属性: href
描述选择器: (留空)
作者选择器: .hnuser
日期选择器: .age
```

**RSS 信息**:
```
配置 ID: hacker-news
RSS 标题: Hacker News 精选
RSS 描述: 最新技术新闻和讨论
最大条目数: 30
```

**生成地址**: `https://your-worker.workers.dev/?custom=hacker-news`

---

### 案例 2：为博客创建 RSS

**目标网址**: `https://example.com/blog`

**选择器配置**:
```
容器选择器: article
标题选择器: h2.post-title
链接选择器: a
描述选择器: .post-excerpt
作者选择器: .author-name
日期选择器: time
图片选择器: .post-image img
```

**智能检测提示**: 直接点击"智能检测"，系统会自动填充大部分字段！

---

### 案例 3：为电商网站创建新品 RSS

**目标网址**: `https://shop.example.com/new-arrivals`

**选择器配置**:
```
容器选择器: .product-card
标题选择器: .product-name
链接选择器: a
描述选择器: .product-desc
图片选择器: img.product-image
图片属性: src
```

**访问地址**: `?custom=shop-new-arrivals`

---

## 🛠️ 选择器使用技巧

### CSS Selector 语法

| 选择器 | 说明 | 示例 |
|--------|------|------|
| `tag` | 标签选择器 | `article`, `h2`, `p` |
| `.class` | 类选择器 | `.post`, `.title` |
| `#id` | ID 选择器 | `#main`, `#content` |
| `parent > child` | 直接子元素 | `div > a`, `article > h2` |
| `parent child` | 所有后代 | `article a`, `div p` |
| `[attr]` | 有属性 | `a[href]`, `img[src]` |
| `[attr="value"]` | 属性值匹配 | `a[class="link"]` |

### 如何找到正确的选择器？

#### 方法 1：使用浏览器开发者工具（推荐）

1. 打开目标网页
2. 按 `F12` 打开开发者工具
3. 点击左上角的"选择元素"工具（或按 `Ctrl+Shift+C`）
4. 鼠标悬停在想要的元素上
5. 在右侧"Elements"面板查看 HTML 结构
6. 右键点击元素 → Copy → Copy selector

#### 方法 2：查看页面源代码

1. 右键点击网页 → "查看网页源代码"
2. 搜索文章标题的文本
3. 找到包含标题的 HTML 标签
4. 观察标签的 class 或 id 属性

#### 方法 3：使用智能检测（最简单）

点击"智能检测"按钮，系统会自动分析并推荐！

---

## 🎯 高级技巧

### 技巧 1：处理相对链接

系统会自动将相对链接转换为绝对链接，无需担心！

**示例**:
- 网页中的链接: `/article/123`
- 自动转换为: `https://example.com/article/123`

### 技巧 2：提取属性值

有些网站的标题或描述存储在 HTML 属性中：

**场景**: 标题在 `title` 属性中
```html
<a href="/post/1" title="文章标题">查看详情</a>
```

**配置**:
- 标题选择器: `a`
- 标题属性: `title`

**场景**: 图片使用懒加载
```html
<img data-src="real-image.jpg" src="placeholder.jpg">
```

**配置**:
- 图片选择器: `img`
- 图片属性: `data-src`

### 技巧 3：组合选择器

**需求**: 只选择特定类别的文章

```
容器选择器: article.category-tech
```

**需求**: 选择第一个链接

```
链接选择器: a:first-child
```

### 技巧 4：排除不需要的内容

**需求**: 排除广告区域

```
容器选择器: article:not(.ad)
```

---

## 🔍 故障排除

### 问题 1：测试时显示"找到 0 条记录"

**原因**: 选择器不正确

**解决**:
1. 检查"容器选择器"是否匹配文章列表
2. 使用浏览器开发者工具验证选择器
3. 尝试更通用的选择器（如 `article` → `div`）
4. 点击"智能检测"重新分析

### 问题 2：链接是相对路径

**表现**: 链接显示为 `/post/123` 而非完整 URL

**解决**: 系统会自动处理，无需担心！如果仍有问题，检查"链接属性"是否设置为 `href`。

### 问题 3：日期格式不正确

**原因**: 网站使用特殊的日期格式

**解决**:
1. 确保日期选择器指向包含日期文本的元素
2. 系统会尝试自动解析多种日期格式
3. 如果仍无法解析，RSS 会使用当前时间

### 问题 4：图片无法显示

**原因**: 
- 图片使用懒加载（`data-src` 而非 `src`）
- 图片是相对路径

**解决**:
1. 检查"图片属性"设置（可能需要改为 `data-src`、`data-original` 等）
2. 系统会自动处理相对路径

### 问题 5：获取到重复的内容

**原因**: 容器选择器匹配了多个层级的元素

**解决**:
1. 使用更精确的选择器
2. 使用直接子选择器 `>`（如 `#main > article`）
3. 添加类名限制（如 `.post-list article`）

---

## 📊 对比传统方法

| 特性 | 传统方法（编写代码） | 可视化生成器 |
|------|-------------------|-------------|
| **技术要求** | 需要编程知识 | ✅ 无需编程 |
| **创建时间** | 30-60 分钟 | ✅ 3-5 分钟 |
| **调试难度** | 需要日志查看 | ✅ 实时预览 |
| **维护成本** | 需要修改代码 | ✅ 界面修改 |
| **学习曲线** | 陡峭 | ✅ 平缓 |
| **错误提示** | 需要看日志 | ✅ 即时反馈 |

---

## 🎓 学习资源

### CSS Selector 教程
- [MDN CSS 选择器](https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_Selectors)
- [CSS Selector 参考手册](https://www.w3schools.com/cssref/css_selectors.asp)
- [CSS Diner](https://flukeout.github.io/) - 互动学习游戏

### 浏览器开发者工具
- [Chrome DevTools 教程](https://developer.chrome.com/docs/devtools/)
- [Firefox 开发者工具](https://developer.mozilla.org/zh-CN/docs/Tools)

### 类似项目参考
- [RSSHub](https://docs.rsshub.app/) - 开源 RSS 生成器
- [RSS-Bridge](https://rss-bridge.github.io/rss-bridge/) - PHP RSS 桥接
- [FiveFilters](https://createfeed.fivefilters.org/) - 在线 RSS 创建工具

---

## 🔗 API 参考

### 获取所有配置
```http
GET /admin/api/rss-builder/configs
Authorization: Bearer YOUR_TOKEN
```

### 创建/更新配置
```http
POST /admin/api/rss-builder/configs
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "id": "my-rss",
  "url": "https://example.com",
  "selectors": {
    "container": "article",
    "title": "h2",
    "link": "a"
  },
  "channelInfo": {
    "title": "My RSS",
    "description": "Custom RSS feed"
  },
  "maxItems": 20
}
```

### 测试配置
```http
POST /admin/api/rss-builder/test
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "url": "https://example.com",
  "selectors": { ... },
  "channelInfo": { ... }
}
```

### 智能检测
```http
POST /admin/api/rss-builder/detect
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "url": "https://example.com"
}
```

### 删除配置
```http
DELETE /admin/api/rss-builder/configs/my-rss
Authorization: Bearer YOUR_TOKEN
```

---

## 🎁 使用提示

1. **先测试再保存** - 确保配置正确后再保存，避免生成无效 RSS
2. **合理命名 ID** - 使用有意义的配置 ID，方便管理（如 `tech-news`、`blog-updates`）
3. **定期检查** - 网站结构可能变化，定期测试 RSS 是否仍正常工作
4. **备份配置** - 可以使用"订阅管理"的导出功能备份所有配置
5. **利用智能检测** - 大多数情况下智能检测就够用了，节省时间！

---

## 💬 常见问题

**Q: 可以为需要登录的网站创建 RSS 吗？**  
A: 目前不支持。系统访问网页时不携带登录凭据，只能抓取公开内容。

**Q: 支持抓取 JavaScript 动态加载的内容吗？**  
A: 部分支持。如果内容在初始 HTML 中，可以抓取；如果需要 JS 执行后才加载，则无法抓取。

**Q: 配置保存后可以修改吗？**  
A: 可以！点击"编辑"按钮即可重新编辑配置。

**Q: 可以创建多少个自定义 RSS？**  
A: 理论上无限制，但受 KV 存储配额限制（免费版 1GB）。

**Q: 生成的 RSS 地址会变吗？**  
A: 不会。只要配置 ID 不变，RSS 地址就永久有效。

**Q: 可以分享配置吗？**  
A: 可以！使用"订阅管理"的导出功能，将配置分享给他人导入。

---

## 🎉 开始创建你的第一个 RSS！

1. 访问管理后台
2. 点击"RSS 生成器"
3. 输入网址并智能检测
4. 测试并保存
5. 享受自定义 RSS！

**祝你使用愉快！如有问题，请查看完整文档或提交 Issue。** 🚀
