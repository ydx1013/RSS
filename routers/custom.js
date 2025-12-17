
import * as cheerio from 'cheerio';
import { parseHTML } from 'linkedom';
import { itemsToRss } from '../rss.js';
import { fetchWithHeaders, fetchWithRetry } from '../utils/fetcher.js';
import { decodeText } from '../utils/helpers.js';
import { fixLazyImages, fixRelativeUrls, cleanHtml, unescapeHtml } from '../utils/html.js';
import { applyFilters } from '../utils/filter.js';
import { translateItems } from '../utils/translator.js';

import feedRouter from './feed.js';
import jsonRouter from './json.js';

export default async function (params, config = {}) {
    const { format = 'rss' } = params;
    let {
        url,
        type, // 'html', 'xpath', 'json', 'rss', 'feed', 'auto' (or undefined)
        itemSelector,
        titleSelector,
        linkSelector,
        linkNeedJoin = false,
        linkBaseUrl = '',
        descSelector,
        dateSelector,
        channelTitle,
        channelDesc,
        maxItems = 20,
        fullText = false,
        fullTextSelector = '',
        encoding = 'auto',
        timestampMode = false,
        timestampUnit = 'ms',
        domainConfig
    } = config;

    if (!url && params.param) {
        url = params.param;
    }

    try {
        // --- Smart Router: Auto Identification & Delegation ---

        // 1. Fetch or use input
        let response;
        if (config._inputResponse) {
            response = config._inputResponse;
        } else {
            // Use fetchWithRetry for better robustness (mirrors)
            // Extract Puppeteer settings
            const usePuppeteer = config.usePuppeteer || false;
            const puppeteerProxyUrl = domainConfig?.puppeteerUrl || '';

            response = await fetchWithRetry(url, {
                headers: {
                    // Accept everything
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7'
                },
                usePuppeteer,
                puppeteerProxyUrl,
                puppeteerWaitSelector: itemSelector // Wait for items to appear
            }, domainConfig?.groups || []);
        }

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }

        let detectedType = type;

        // 2. Auto-Detect if type is missing or 'auto'
        if (!detectedType || detectedType === 'auto') {
            const contentType = (response.headers.get('content-type') || '').toLowerCase();

            // Clone response to peek at body (limit checks to first 1KB)
            try {
                const clone = response.clone();
                const textStart = (await clone.text()).substring(0, 1000).trim();

                if (contentType.includes('json') || textStart.startsWith('{') || textStart.startsWith('[')) {
                    detectedType = 'json';
                } else if (contentType.includes('xml') || textStart.includes('<rss') || textStart.includes('<feed') || textStart.includes('<channel')) {
                    detectedType = 'feed'; // maps to feedRouter
                } else if (contentType.includes('html') || textStart.includes('<!DOCTYPE html') || textStart.includes('<html')) {
                    detectedType = 'html'; // maps to customRouter logic
                } else {
                    detectedType = 'html'; // default fallback
                }

                console.log(`[Smart Router] Auto-detected type '${detectedType}' for ${url}`);
            } catch (e) {
                console.warn('[Smart Router] Detection failed, defaulting to HTML', e);
                detectedType = 'html';
            }
        }

        // 3. Delegate
        if (detectedType === 'json') {
            // Pass original response to jsonRouter
            const result = await jsonRouter(params, { ...config, _inputResponse: response });
            if (response && response.effectiveRequestUrl && response.effectiveRequestUrl !== url) {
                result.newUrl = response.effectiveRequestUrl;
                result.failures = response.retryFailures || [];
            }
            return result;
        }

        if (detectedType === 'rss' || detectedType === 'feed' || detectedType === 'atom') {
            const result = await feedRouter(params, { ...config, _inputResponse: response });
            if (response && response.effectiveRequestUrl && response.effectiveRequestUrl !== url) {
                result.newUrl = response.effectiveRequestUrl;
                result.failures = response.retryFailures || [];
            }
            return result;
        }

        // Update mode based on detection (e.g. 'auto' -> 'html')
        if (detectedType) {
            type = detectedType;
        }

        // If 'html' or 'xpath', continue with this function (Scraping Logic)

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
                } catch (e) { }
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
                    } catch (e) { }
                }

                const pubDate = getText(dateSelector, el);

                // 如果启用了链接拼接，处理相对URL
                if (linkNeedJoin && link && !link.startsWith('http')) {
                    try {
                        const baseUrl = linkBaseUrl ? new URL(linkBaseUrl) : new URL(url);
                        link = new URL(link, baseUrl).href;
                    } catch (e) { }
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
                    } catch (e) {
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
                        // Fix lazy images using enhanced utility
                        fixLazyImages($, descEl);
                        // Clean HTML (remove ads, sanitize custom tags like tg-emoji)
                        cleanHtml(descEl);

                        description = descEl.first().html();

                        // Fix Double Escaping using robust utility
                        description = unescapeHtml(description);
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
                    } catch (e) {
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
                    } catch (e) {
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

        // 全文抓取功能
        if (fullText && fullTextSelector && items.length > 0) {
            console.log(`[Full Text] Starting to fetch full content for ${items.length} items`);

            const fullTextItems = [];
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (!item.link) {
                    fullTextItems.push(item);
                    continue;
                }

                try {
                    // Ensure URL is absolute
                    let fetchUrl = item.link;
                    if (!fetchUrl.startsWith('http')) {
                        try {
                            fetchUrl = new URL(fetchUrl, url).href;
                        } catch (e) {
                            console.error(`[Full Text] Invalid URL: ${fetchUrl}`);
                            fullTextItems.push(item);
                            continue;
                        }
                    }

                    console.log(`[Full Text] Fetching: ${fetchUrl}`);
                    const articleResp = await fetchWithHeaders(fetchUrl);

                    if (!articleResp.ok) {
                        console.error(`[Full Text] HTTP Error ${articleResp.status} for ${fetchUrl}`);
                        fullTextItems.push(item);
                        continue;
                    }

                    const articleHtml = await decodeText(articleResp, encoding);
                    const $article = cheerio.load(articleHtml);

                    // 提取全文内容
                    let fullContent = '';
                    if (fullTextSelector) {
                        const contentEl = $article(fullTextSelector);
                        if (contentEl.length > 0) {
                            // Fix lazy images using enhanced utility
                            fixLazyImages($article, contentEl);
                            // Also fix relative URLs
                            fixRelativeUrls($article, fetchUrl);

                            // Handle multiple matches (e.g. selector is "p")
                            if (contentEl.length > 1) {
                                fullContent = contentEl.map((i, el) => $article(el).html()).get().join('<br/>');
                            } else {
                                fullContent = contentEl.html() || contentEl.text();
                            }
                        }
                    }

                    // 如果成功获取到全文，替换description
                    if (fullContent && fullContent.trim()) {
                        fullTextItems.push({
                            ...item,
                            description: fullContent
                        });
                        console.log(`[Full Text] Success: ${fetchUrl} (${fullContent.length} chars)`);
                    } else {
                        console.log(`[Full Text] No content found for: ${fetchUrl}`);
                        fullTextItems.push(item);
                    }

                    // 添加延迟避免请求过快
                    if (i < items.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                } catch (e) {
                    console.error(`[Full Text] Error fetching ${item.link}:`, e.message);
                    fullTextItems.push(item);
                }
            }

            items = fullTextItems;
            console.log(`[Full Text] Completed. ${items.length} items processed.`);
        }

        // --- Filtering ---
        const filters = config.filters || (config.filter?.enabled ? config.filter.rules : null);
        if (Array.isArray(filters) && filters.length > 0) {
            const originalCount = items.length;
            items = applyFilters(items, filters);
            console.log(`[Filter] Applied rules. ${originalCount} -> ${items.length} items.`);
        }

        // --- Translation ---
        if (config.translation && config.translation.enabled) {
            // Need global settings for API keys. 
            // We expect global settings to be injected into config.domainConfig or passed differently?
            // Actually, handleAdminRequest passes domain_config. But we need admin_settings (keys).
            // Main.js injection logic needs to be checked. Assuming 'domainConfig' might contain specific settings,
            // or we might need to fetch admin_settings. 
            // Ideally, we reuse domainConfig if it has the keys, OR we rely on env injection if possible.
            // *Wait*, handleAdminRequest fetches 'admin_settings' separately. 
            // In main.js/feed.js, we might not have 'admin_settings'.
            // OPTION: Pass admin_settings in config from main.js? 
            // Let's assume config.globalSettings is passed or we extract from domainConfig if we allow setting there.
            // FOR NOW: Let's assume config.globalSettings is passed. (I need to update main.js/feed.js to pass this)

            items = await translateItems(items, config, config.globalSettings);
        }

        const channel = {
            title: channelTitle || config.key || 'Custom Feed',
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

        const result = {
            data: data,
            items: items, // Return raw items for preview
            isError: false,
        };

        if (response && response.effectiveRequestUrl && response.effectiveRequestUrl !== url) {
            result.newUrl = response.effectiveRequestUrl;
            result.failures = response.retryFailures || [];
        }

        return result;

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
