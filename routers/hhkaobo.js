/**
 * 弘博考博网RSS解析器
 * 网站：http://www.hhkaobo.com/article/7?page=1
 * 提取博士研究生招生简章列表、标题、发布时间等信息
 */

import { itemsToRss } from "../rss.js"
import * as cheerio from "cheerio"

/**
 * 弘博考博网RSS处理函数
 * @param {string} paramValue - URL参数值 (支持分页参数，如1,2,3等)
 * @param {string} workerUrl - Worker的URL地址
 * @returns {string} RSS XML格式的招生简章列表
 */
export default async function (params) {
    const { param: paramValue, format, maxItems } = params;
    try {
        // 解析页码参数，默认为第1页
        const page = parseInt(paramValue) || 1;
        const targetUrl = `http://www.hhkaobo.com/article/7?page=${page}`;
        
        // 构建请求选项，模拟浏览器
        const requestOptions = {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Referer': 'http://www.hhkaobo.com/'
            }
        };

        console.log(`Fetching 弘博考博网 page ${page} from: ${targetUrl}`);

        // 发起请求获取页面数据
        const response = await fetch(targetUrl, requestOptions);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const htmlContent = await response.text();
        
        // 如果参数值为'raw'，直接返回原始HTML
        if (paramValue === 'raw') {
            return htmlContent;
        }

        // 使用 Cheerio 解析 HTML
        const $ = cheerio.load(htmlContent);
        
        // 选择所有新闻列表项 - 更精确的选择器
        const newsListItems = $('li').filter((index, element) => {
            const $item = $(element);
            const $link = $item.find('a[target="_blank"]');
            const $span = $item.find('span');
            return $link.length > 0 && $span.length > 0;
        });
        
        console.log(`Found ${newsListItems.length} news items on page ${page}`);

        const newsItems = [];

        // 遍历每个新闻项 - 使用 Cheerio 但保持原有的同步逻辑
        for (let i = 0; i < newsListItems.length; i++) {
            try {
                const $item = $(newsListItems[i]);
                const $link = $item.find('a[target="_blank"]');
                const $span = $item.find('span');
                
                const href = $link.attr('href');
                const title = $link.text().trim();
                const timeStr = $span.text().trim();
                
                // 构建完整的URL - 修复相对路径问题
                const fullUrl = href && href.startsWith('http') ? href : `http://www.hhkaobo.com${href}`;
                
                console.log(`Fetching full content for: ${title.slice(0, 30)}...`);
                
                // 获取文章详细内容
                const fullContent = await fetchArticleContent(fullUrl, requestOptions);
                
                // 解析时间
                const publishTime = timeStr.trim();
                let pubDate;
                try {
                    // 时间格式: 2025-09-19 15:48:39
                    pubDate = new Date(publishTime.replace(/\s+/g, 'T')).toUTCString();
                } catch (e) {
                    pubDate = new Date().toUTCString();
                }
                
                // 分析招生类型和学校
                const titleText = title.trim();
                let category = '博士招生';
                let schoolName = '';
                
                // 提取学校名称
                const schoolMatch = titleText.match(/^(.+?大学|.+?学院|.+?研究所|.+?研究院|西湖大学|中科院.+)/);
                if (schoolMatch) {
                    schoolName = schoolMatch[1];
                }
                
                // 分析招生类型
                if (titleText.includes('推荐免试') || titleText.includes('推免') || titleText.includes('直博')) {
                    category = '推免招生';
                } else if (titleText.includes('在职')) {
                    category = '在职招生';
                } else if (titleText.includes('专项') || titleText.includes('联合培养')) {
                    category = '专项招生';
                } else if (titleText.includes('汇总') || titleText.includes('全国')) {
                    category = '招生汇总';
                }
                
                // 构建描述 - 使用全文内容
                let description = '';
                if (schoolName) description += `🏫 **${schoolName}**<br/>`;
                description += `📋 **招生类型：** ${category}<br/>`;
                description += `📅 **发布时间：** ${publishTime}<br/><br/>`;
                
                // 添加全文内容
                if (fullContent) {
                    description += `� **招生简章全文：**<br/>${fullContent}`;
                } else {
                    description += `�🔗 **查看详情：** [点击查看完整招生简章](${fullUrl})`;
                }
                
                // 构建新闻对象
                const newsItem = {
                    title: titleText,
                    link: fullUrl,
                    description: `<![CDATA[${description}]]>`,
                    pubDate: pubDate,
                    guid: fullUrl,
                    author: schoolName || '弘博考博网',
                    category: category,
                    enclosure: {
                        url: "http://www.hhkaobo.com/favicon.ico",
                        length: "0",
                        type: "image/x-icon"
                    }
                };

                newsItems.push(newsItem);
            } catch (err) {
                console.log(`Error parsing news item ${i}:`, err.message);
            }
        }

        // 按时间排序（最新的在前）
        newsItems.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

        let finalNewsItems = newsItems;
        if (finalNewsItems.length > maxItems) {
            finalNewsItems = finalNewsItems.slice(0, maxItems);
        }

        console.log(`Processed ${finalNewsItems.length} news items`);

        // 构建 RSS 频道信息
        const pageInfo = page > 1 ? ` - 第${page}页` : '';
        const channel = {
            title: `弘博考博网 - 博士招生动态${pageInfo}`,
            link: "http://www.hhkaobo.com/article/7",
            description: "弘博考博网最新博士研究生招生简章、推免招生、专项招生等信息汇总",
            image: "http://www.hhkaobo.com/favicon.ico"
        };

        // 使用通用函数生成RSS
        return {
            data: itemsToRss(finalNewsItems, channel, format),
            isError: false,
        };

    } catch (error) {
        console.error('Error in hhkaobo RSS:', error);
        
        // 返回错误信息的RSS
        const errorItems = [{
            title: 'RSS获取错误',
            link: 'http://www.hhkaobo.com/article/7',
            description: `获取弘博考博网信息时发生错误：${error.message}`,
            pubDate: new Date().toUTCString(),
            guid: `error-${Date.now()}`,
            author: '系统',
            category: '错误'
        }];
        
        const errorChannel = {
            title: '弘博考博网RSS - 错误',
            link: 'http://www.hhkaobo.com/article/7',
            description: 'RSS获取过程中发生错误',
            image: 'http://www.hhkaobo.com/favicon.ico'
        };
        
        return {
            data: itemsToRss(errorItems, errorChannel, format),
            isError: true,
        };
    }
}

/**
 * 获取文章详细内容
 * @param {string} url - 文章详情页URL
 * @param {Object} requestOptions - 请求选项
 * @returns {string} 文章内容HTML
 */
async function fetchArticleContent(url, requestOptions) {
    try {
        const response = await fetch(url, requestOptions);
        if (!response.ok) {
            console.log(`Failed to fetch article: ${response.status}`);
            return null;
        }
        
        const html = await response.text();
        
        // 使用 Cheerio 解析 HTML，替换复杂的正则表达式
        const $ = cheerio.load(html);
        
        // 使用 CSS 选择器提取内容区域 - 更准确且易维护
        const contentDiv = $('.content');
        
        if (contentDiv.length > 0) {
            // 获取 HTML 内容
            let content = contentDiv.html();
            
            if (content) {
                // 清理和格式化内容
                content = cleanAndFormatContent(content);
                return content;
            }
        }
        
        console.log('Content div not found in article');
        return null;
        
    } catch (error) {
        console.log(`Error fetching article content: ${error.message}`);
        return null;
    }
}

/**
 * 清理和格式化文章内容
 * @param {string} rawContent - 原始HTML内容
 * @returns {string} 清理后的内容
 */
function cleanAndFormatContent(rawContent) {
    try {
        // 使用 Cheerio 解析和清理 HTML - 比正则表达式更可靠
        const $ = cheerio.load(rawContent);
        
        // 移除不需要的元素
        $('script, style, noscript').remove();
        
        // 移除注释
        $('*').contents().filter(function() {
            return this.nodeType === 8; // Comment node
        }).remove();
        
        // 清理空的段落标签
        $('p:empty').remove();
        
        // 移除所有标签的属性，只保留基本标签结构
        $('*').each(function() {
            const tagName = $(this).prop('tagName');
            if (tagName) {
                $(this).removeAttr('class style id onclick onload');
            }
        });
        
        // 获取清理后的HTML
        let content = $.html();
        
        // 处理常见的HTML实体
        content = content
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            // 移除过多的换行符
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        
        // 如果内容过长，截取前3000字符
        if (content.length > 3000) {
            content = content.substring(0, 3000) + '...<br/><br/><em>内容较长，已截取部分显示</em>';
        }
        
        return content;
        
    } catch (error) {
        console.log('Error cleaning content with Cheerio, falling back to regex:', error.message);
        
        // 如果 Cheerio 处理失败，回退到原来的正则表达式方法
        return fallbackCleanContent(rawContent);
    }
}

/**
 * 回退的内容清理方法（原正则表达式方式）
 * @param {string} rawContent - 原始HTML内容
 * @returns {string} 清理后的内容
 */
function fallbackCleanContent(rawContent) {
    let content = rawContent
        // 移除script和style标签
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        // 移除HTML注释
        .replace(/<!--[\s\S]*?-->/g, '')
        // 清理多余的空白字符
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        // 移除空的段落标签
        .replace(/<p>\s*<\/p>/g, '')
        // 保留重要的HTML标签但移除所有属性
        .replace(/<(\w+)[^>]*>/g, '<$1>')
        // 处理常见的HTML实体
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        // 移除过多的换行符
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    
    // 如果内容过长，截取前3000字符
    if (content.length > 3000) {
        content = content.substring(0, 3000) + '...<br/><br/><em>内容较长，已截取部分显示</em>';
    }
    
    return content;
}

