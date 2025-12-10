
import * as cheerio from 'cheerio';
import { parseHTML } from 'linkedom';
import { itemsToRss } from '../rss.js';
import { fetchWithHeaders } from '../utils/fetcher.js';
import { decodeText } from '../utils/helpers.js';
import pLimit from 'p-limit';

export default async function (params, config) {
    const { format = 'rss' } = params; // 默认RSS格式，由URL参数控制
    const { 
        url, 
        type = 'html', // 'html', 'xpath', 'json'
        itemSelector, 
        titleSelector, 
        linkSelector, 
        linkNeedJoin = false, // 是否拼接域名（针对相对链接）
        linkBaseUrl = '', // 自定义拼接域名
        descSelector, 
        dateSelector,
        channelTitle,
        channelDesc,
        maxItems = 20, // 从配置中读取，默认20条
        fullText = false, // 是否抓取全文
        fullTextSelector = '', // 全文内容选择器（用于抓取文章详情页）
        encoding = 'auto', // 字符编码: 'auto', 'utf-8', 'gbk', 'gb2312', 'big5'等
        timestampMode = false, // 是否为时间戳格式
        timestampUnit = 'ms' // 时间戳单位: 's'(秒) 或 'ms'(毫秒)
    } = config;

    try {
        const response = await fetchWithHeaders(url);

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }

        let items = [];

        if (type === 'xpath') {
            const html = await decodeText(response, encoding);
            const { document } = parseHTML(html);

            // Helper to evaluate XPath and return nodes
            const getNodes = (xpath, context) => {
                try {
                    const result = document.evaluate(xpath, context, null, 7, null); // ORDERED_NODE_SNAPSHOT_TYPE
                    const nodes = [];
                    for (let i = 0; i < result.snapshotLength; i++) {
                        nodes.push(result.snapshotItem(i));
                    }
                    return nodes;
                } catch (e) {
                    console.error('XPath Error:', xpath, e);
                    return [];
                }
            };

            // Helper to get text content from a relative xpath
            const getText = (xpath, context) => {
                if (!xpath) return '';
                // Ensure relative path
                let safePath = xpath;
                if (!safePath.startsWith('.') && !safePath.startsWith('/')) safePath = './' + safePath;
                
                try {
                    const result = document.evaluate(safePath, context, null, 2, null); // STRING_TYPE
                    return result.stringValue?.trim() || '';
                } catch (e) { return ''; }
            };

            // Helper to get link
            const getLink = (xpath, context) => {
                if (!xpath) return '';
                let safePath = xpath;
                if (!safePath.startsWith('.') && !safePath.startsWith('/')) safePath = './' + safePath;

                try {
                    // Try string value first (e.g. @href)
                    const result = document.evaluate(safePath, context, null, 2, null);
                    if (result.stringValue) return result.stringValue;
                    
                    // Try node value
                    const nodeResult = document.evaluate(safePath, context, null, 9, null); // FIRST_ORDERED_NODE_TYPE
                    const node = nodeResult.singleNodeValue;
                    if (node) {
                        return node.getAttribute('href') || node.textContent;
                    }
                } catch (e) {}
                return '';
            };

            const listNodes = getNodes(itemSelector, document);
            
            items = listNodes.slice(0, maxItems).map(el => {
                const title = getText(titleSelector, el);
                let link = getLink(linkSelector, el);
                
                // Description: Try to get innerHTML if possible, otherwise text
                let description = '';
                if (descSelector) {
                    let safePath = descSelector;
                    if (!safePath.startsWith('.') && !safePath.startsWith('/')) safePath = './' + safePath;
                    try {
                        const nodeResult = document.evaluate(safePath, el, null, 9, null);
                        const node = nodeResult.singleNodeValue;
                        if (node) description = node.innerHTML || node.textContent;
                        else description = getText(descSelector, el);
                    } catch(e) {}
                }

                const pubDate = getText(dateSelector, el);

                // 如果启用了链接拼接，处理相对URL
                if (linkNeedJoin && link && !link.startsWith('http')) {
                    try {
                        const baseUrl = linkBaseUrl ? new URL(linkBaseUrl) : new URL(url);
                        link = new URL(link, baseUrl).href;
                    } catch(e) {}
                }
                
                // 处理日期转换
                let formattedPubDate = new Date().toUTCString();
                if (pubDate) {
                    try {
                        if (timestampMode) {
                            const numVal = parseInt(pubDate);
                            const timestamp = timestampUnit === 's' ? numVal * 1000 : numVal;
                            formattedPubDate = new Date(timestamp).toUTCString();
                        } else {
                            formattedPubDate = new Date(pubDate).toUTCString();
                        }
                    } catch(e) {
                        console.error('日期解析错误:', e);
                        formattedPubDate = new Date().toUTCString();
                    }
                }

                return {
                    title,
                    link,
                    description,
                    pubDate: formattedPubDate
                };
            });

        } else {
            // HTML (Cheerio)
            const html = await decodeText(response, encoding);
            const $ = cheerio.load(html);
            const list = $(itemSelector);

            console.log(`[Custom RSS] Found ${list.length} items with selector: ${itemSelector}`);

            list.slice(0, maxItems).each((i, el) => {
                const $el = $(el);
                
                // Title: 智能提取
                let title = '';
                if (titleSelector) {
                    const titleEl = $el.find(titleSelector);
                    if (titleEl.length > 0) {
                        title = titleEl.first().text().trim();
                    }
                }
                
                // 如果还没有标题，使用回退方案
                if (!title) {
                    title = $el.find('a').first().text().trim() || $el.text().trim().substring(0, 50);
                }
                
                // Link: try to find with selector, or use first <a> tag
                let link = '';
                if (linkSelector) {
                    const linkEl = $el.find(linkSelector);
                    link = linkEl.length > 0 ? linkEl.first().attr('href') : '';
                } else {
                    link = $el.find('a').first().attr('href') || '';
                }
                
                // Description: 提取 HTML 内容
                let description = '';
                if (descSelector) {
                    const descEl = $el.find(descSelector);
                    if (descEl.length > 0) {
                        description = descEl.first().html();
                    }
                }
                if (!description) description = title;
                
                // Date: 智能提取
                let pubDate = '';
                if (dateSelector) {
                    const dateEl = $el.find(dateSelector);
                    if (dateEl.length > 0) {
                        pubDate = dateEl.first().text().trim();
                    }
                }

                // Handle relative URLs
                if (linkNeedJoin && link && !link.startsWith('http')) {
                    try {
                        const baseUrl = linkBaseUrl ? new URL(linkBaseUrl) : new URL(url);
                        link = new URL(link, baseUrl).href;
                    } catch(e) {
                        console.error('URL parse error:', e);
                    }
                }
                
                // 处理日期转换
                let formattedPubDate = new Date().toUTCString();
                if (pubDate) {
                    try {
                        if (timestampMode) {
                            const numVal = parseInt(pubDate);
                            const timestamp = timestampUnit === 's' ? numVal * 1000 : numVal;
                            formattedPubDate = new Date(timestamp).toUTCString();
                        } else {
                            formattedPubDate = new Date(pubDate).toUTCString();
                        }
                    } catch(e) {
                        console.error('日期解析错误:', e);
                        formattedPubDate = new Date().toUTCString();
                    }
                }

                // Only add items with at least a title or link
                if (title || link) {
                    items.push({
                        title: title || 'No title',
                        link: link || url,
                        description: description || title,
                        pubDate: formattedPubDate
                    });
                }
            });
        }

        // 全文抓取功能（并发受控）
        if (fullText && fullTextSelector && items.length > 0) {
            // 支持两个可配置项：fullTextConcurrency（并发数，默认3）和 fullTextDelay（每个任务完成后的延迟，毫秒，默认0）
            const concurrency = typeof config.fullTextConcurrency === 'number' && config.fullTextConcurrency > 0 ? config.fullTextConcurrency : 3;
            const delayMs = typeof config.fullTextDelay === 'number' && config.fullTextDelay > 0 ? config.fullTextDelay : 0;

            console.log(`[Full Text] Starting to fetch full content for ${items.length} items with concurrency=${concurrency}, delay=${delayMs}ms`);

            const limit = pLimit(concurrency);

            const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

            const tasks = items.map((item) => limit(async () => {
                if (!item.link) return item;

                try {
                    // Ensure URL is absolute
                    let fetchUrl = item.link;
                    if (!fetchUrl.startsWith('http')) {
                        try {
                            fetchUrl = new URL(fetchUrl, url).href;
                        } catch (e) {
                            console.error(`[Full Text] Invalid URL: ${fetchUrl}`);
                            return item;
                        }
                    }

                    console.log(`[Full Text] Fetching: ${fetchUrl}`);
                    const articleResp = await fetchWithHeaders(fetchUrl);
                    if (!articleResp.ok) {
                        console.error(`[Full Text] HTTP Error ${articleResp.status} for ${fetchUrl}`);
                        return item;
                    }

                    const articleHtml = await decodeText(articleResp, encoding);
                    const $article = cheerio.load(articleHtml);

                    // 提取全文内容
                    let fullContent = '';
                    if (fullTextSelector) {
                        const contentEl = $article(fullTextSelector);
                        if (contentEl.length > 0) {
                            if (contentEl.length > 1) {
                                fullContent = contentEl.map((i, el) => $article(el).html()).get().join('<br/>');
                            } else {
                                fullContent = contentEl.html() || contentEl.text();
                            }
                        }
                    }

                    if (fullContent && fullContent.trim()) {
                        console.log(`[Full Text] Success: ${fetchUrl} (${fullContent.length} chars)`);
                        const newItem = { ...item, description: fullContent };
                        if (delayMs > 0) await sleep(delayMs);
                        return newItem;
                    } else {
                        console.log(`[Full Text] No content found for: ${fetchUrl}`);
                        if (delayMs > 0) await sleep(delayMs);
                        return item;
                    }
                } catch (e) {
                    console.error(`[Full Text] Error fetching ${item.link}:`, e && e.message ? e.message : e);
                    return item;
                }
            }));

            const fullTextItems = await Promise.all(tasks);
            items = fullTextItems;
            console.log(`[Full Text] Completed. ${items.length} items processed.`);
        }

        const channel = {
            title: channelTitle || 'Custom Feed',
            link: url,
            description: channelDesc || 'Generated by RSS Worker',
            image: '', // Optional
        };

        // 支持 JSON 格式输出
        let data;
        if (format === 'json') {
            data = JSON.stringify({
                channel: channel,
                items: items,
                count: items.length,
                generated: new Date().toISOString(),
                fullText: fullText || false
            }, null, 2);
        } else {
            data = itemsToRss(items, channel, format);
        }

        return {
            data: data,
            items: items, // Return raw items for preview
            isError: false,
        };

    } catch (error) {
        console.error('Custom RSS Error:', error);
        return {
            data: itemsToRss([{
                title: 'Error generating feed',
                link: url,
                description: error.message,
                pubDate: new Date().toUTCString()
            }], { title: 'Error' }, format),
            isError: true
        };
    }
}
