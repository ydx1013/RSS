// admin/rss-builder.js
// RSS 生成器模块 - 可视化创建 RSS 订阅源

import * as cheerio from "cheerio";
import { itemsToRss } from "../rss.js";

/**
 * 获取所有自定义 RSS 配置
 */
export async function getAllCustomRSS(KV) {
    try {
        const list = await KV.list({ prefix: 'custom_rss:' });
        const configs = [];

        for (const key of list.keys) {
            const data = await KV.get(key.name, { type: 'json' });
            if (data) {
                configs.push({
                    id: key.name.replace('custom_rss:', ''),
                    ...data
                });
            }
        }

        return configs;
    } catch (error) {
        console.error('获取自定义 RSS 配置失败:', error);
        return [];
    }
}

/**
 * 保存自定义 RSS 配置
 */
export async function saveCustomRSS(KV, id, config) {
    try {
        const data = {
            ...config,
            updatedAt: new Date().toISOString()
        };

        const existing = await KV.get(`custom_rss:${id}`, { type: 'json' });
        if (!existing) {
            data.createdAt = new Date().toISOString();
        } else {
            data.createdAt = existing.createdAt;
        }

        await KV.put(`custom_rss:${id}`, JSON.stringify(data));
        return data;
    } catch (error) {
        console.error('保存自定义 RSS 配置失败:', error);
        throw error;
    }
}

/**
 * 删除自定义 RSS 配置
 */
export async function deleteCustomRSS(KV, id) {
    try {
        await KV.delete(`custom_rss:${id}`);
        return true;
    } catch (error) {
        console.error('删除自定义 RSS 配置失败:', error);
        return false;
    }
}

/**
 * 获取单个配置
 */
export async function getCustomRSS(KV, id) {
    try {
        const data = await KV.get(`custom_rss:${id}`, { type: 'json' });
        return data;
    } catch (error) {
        console.error('获取自定义 RSS 配置失败:', error);
        return null;
    }
}

/**
 * 测试 RSS 配置并预览结果
 */
export async function testRSSConfig(config, workerUrl) {
    try {
        const { url, selectors, channelInfo } = config;

        // 获取网页内容
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // 解析 RSS 条目
        const items = [];
        const containerSelector = selectors.container || 'body';
        
        $(containerSelector).each((index, element) => {
            if (index >= (config.maxItems || 20)) return false;

            const item = {};

            // 标题
            if (selectors.title) {
                const titleElem = $(element).find(selectors.title);
                item.title = selectors.titleAttr 
                    ? titleElem.attr(selectors.titleAttr)
                    : titleElem.text().trim();
            }

            // 链接
            if (selectors.link) {
                const linkElem = $(element).find(selectors.link);
                let link = selectors.linkAttr 
                    ? linkElem.attr(selectors.linkAttr)
                    : linkElem.attr('href');
                
                // 处理相对链接
                if (link && !link.startsWith('http')) {
                    const baseUrl = new URL(url);
                    link = new URL(link, baseUrl.origin).href;
                }
                item.link = link;
            }

            // 描述
            if (selectors.description) {
                const descElem = $(element).find(selectors.description);
                item.description = selectors.descriptionAttr
                    ? descElem.attr(selectors.descriptionAttr)
                    : `<![CDATA[${descElem.html() || descElem.text()}]]>`;
            }

            // 作者
            if (selectors.author) {
                const authorElem = $(element).find(selectors.author);
                item.author = selectors.authorAttr
                    ? authorElem.attr(selectors.authorAttr)
                    : authorElem.text().trim();
            }

            // 日期
            if (selectors.pubDate) {
                const dateElem = $(element).find(selectors.pubDate);
                const dateText = selectors.pubDateAttr
                    ? dateElem.attr(selectors.pubDateAttr)
                    : dateElem.text().trim();
                
                try {
                    item.pubDate = new Date(dateText).toUTCString();
                } catch (e) {
                    item.pubDate = new Date().toUTCString();
                }
            } else {
                item.pubDate = new Date().toUTCString();
            }

            // 图片
            if (selectors.image) {
                const imgElem = $(element).find(selectors.image);
                let imgUrl = selectors.imageAttr
                    ? imgElem.attr(selectors.imageAttr)
                    : imgElem.attr('src');
                
                if (imgUrl && !imgUrl.startsWith('http')) {
                    const baseUrl = new URL(url);
                    imgUrl = new URL(imgUrl, baseUrl.origin).href;
                }
                
                if (imgUrl) {
                    item.enclosure = {
                        url: imgUrl,
                        type: 'image/jpeg',
                        length: '0'
                    };
                }
            }

            // GUID
            item.guid = item.link || `${url}#${index}`;

            // 只添加有标题或链接的条目
            if (item.title || item.link) {
                items.push(item);
            }
        });

        // 构建频道信息
        const channel = {
            title: channelInfo?.title || $('title').text() || '自定义 RSS',
            link: url,
            description: channelInfo?.description || '使用 WorkerRSS 生成',
            image: channelInfo?.image || `${workerUrl}/favicon.ico`
        };

        return {
            success: true,
            itemsCount: items.length,
            items: items.slice(0, 5), // 预览只返回前5条
            channel,
            rss: itemsToRss(items, channel, 'rss')
        };

    } catch (error) {
        console.error('测试 RSS 配置失败:', error);
        return {
            success: false,
            error: error.message,
            stack: error.stack
        };
    }
}

/**
 * 根据 URL 自动检测可能的选择器
 */
export async function detectSelectors(url) {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        const suggestions = {
            url,
            channelInfo: {
                title: $('title').text().trim() || '',
                description: $('meta[name="description"]').attr('content') || '',
                image: $('meta[property="og:image"]').attr('content') || ''
            },
            selectors: {
                // 尝试检测文章容器
                container: detectContainer($),
                // 尝试检测标题选择器
                title: detectTitleSelector($),
                // 尝试检测链接选择器
                link: detectLinkSelector($),
                // 尝试检测描述选择器
                description: detectDescriptionSelector($),
            },
            suggestions: {
                containers: findPossibleContainers($),
                titles: findPossibleTitles($),
                links: findPossibleLinks($)
            }
        };

        return suggestions;

    } catch (error) {
        console.error('检测选择器失败:', error);
        return {
            error: error.message,
            suggestions: {
                containers: ['article', '.post', '.entry', '.item'],
                titles: ['h1', 'h2', 'h3', '.title'],
                links: ['a[href]'],
            }
        };
    }
}

// 辅助函数：检测文章容器
function detectContainer($) {
    const candidates = [
        'article', '.article', '#article',
        '.post', '#post', '.entry', '.item',
        '.news-item', '.list-item', '.card'
    ];

    for (const selector of candidates) {
        if ($(selector).length >= 2) {
            return selector;
        }
    }

    return 'article';
}

// 辅助函数：检测标题选择器
function detectTitleSelector($) {
    const candidates = [
        'h1', 'h2', 'h3',
        '.title', '.headline', '.post-title',
        'a.title', '.entry-title'
    ];

    for (const selector of candidates) {
        if ($(selector).length > 0) {
            return selector;
        }
    }

    return 'h2';
}

// 辅助函数：检测链接选择器
function detectLinkSelector($) {
    return 'a';
}

// 辅助函数：检测描述选择器
function detectDescriptionSelector($) {
    const candidates = [
        '.description', '.summary', '.excerpt',
        '.content', 'p', '.post-content'
    ];

    for (const selector of candidates) {
        if ($(selector).length > 0) {
            return selector;
        }
    }

    return 'p';
}

// 查找可能的容器
function findPossibleContainers($) {
    const containers = new Set();
    
    $('article, .article, .post, .entry, .item, .news-item, .card').each((i, elem) => {
        containers.add(elem.tagName.toLowerCase() + (elem.attribs.class ? `.${elem.attribs.class.split(' ')[0]}` : ''));
    });

    return Array.from(containers).slice(0, 10);
}

// 查找可能的标题
function findPossibleTitles($) {
    const titles = new Set();
    
    $('h1, h2, h3, .title, .headline').each((i, elem) => {
        if (i < 10) {
            titles.add(elem.tagName.toLowerCase() + (elem.attribs.class ? `.${elem.attribs.class.split(' ')[0]}` : ''));
        }
    });

    return Array.from(titles);
}

// 查找可能的链接
function findPossibleLinks($) {
    return ['a', 'a.title', 'a[href]', '.link a'];
}
