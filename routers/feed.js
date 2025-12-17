import * as cheerio from 'cheerio';
import { itemsToRss } from '../rss.js';
import { fetchWithHeaders, fetchWithRetry } from '../utils/fetcher.js';
import { xmlToJson, getVal, decodeText } from '../utils/helpers.js';
import { fixLazyImages, fixRelativeUrls, unescapeHtml } from '../utils/html.js';
import { applyFilters } from '../utils/filter.js';
import { translateItems } from '../utils/translator.js';

export default async function (params, config) {
    const { format = 'rss' } = params;
    const {
        url,
        channelTitle,
        channelDesc,
        maxItems = 20,
        itemSelector, // Optional: Custom selector for items
        titleSelector,
        linkSelector,
        descSelector,
        dateSelector,
        fullText = false,
        fullTextSelector = '',
        encoding = 'auto',
        domainConfig // Injected from main.js
    } = config;

    const logs = []; // Collect logs for preview
    const log = (msg) => {
        console.log(msg);
        logs.push(msg);
    };

    try {
        log(`[Feed] Config: fullText=${fullText}, fullTextSelector="${fullTextSelector}", itemSelector="${itemSelector}"`);

        let response;
        if (config._inputResponse) {
            response = config._inputResponse;
        } else {
            response = await fetchWithRetry(url, {
                headers: {
                    'Accept': 'application/rss+xml, application/xml, application/atom+xml, text/xml, */*'
                },
            }, domainConfig?.groups || []);
        }

        // Check if we used a different URL (mirror)
        let newUrl = null;
        if (response.effectiveRequestUrl && response.effectiveRequestUrl !== url) {
            log(`[Feed] URL updated from ${url} to ${response.effectiveRequestUrl}`);
            newUrl = response.effectiveRequestUrl;
        }

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }

        const text = await decodeText(response, encoding);
        log(`[Feed] Fetched XML, length: ${text.length}`);

        let items = [];
        let channel = {};

        // If custom selectors are provided, use JSON extraction mode
        if (itemSelector) {
            log('[Feed] Using custom selector mode');
            const json = xmlToJson(text);
            let list = getVal(json, itemSelector);

            // Normalize list
            if (!Array.isArray(list)) {
                if (list && typeof list === 'object') {
                    list = [list];
                } else {
                    list = [];
                }
            }

            items = list.slice(0, maxItems).map(item => {
                // Helper for template processing (copied from json.js logic, simplified)
                const processTemplate = (obj, template) => {
                    if (!template) return '';
                    if (template.includes('{') && template.includes('}')) {
                        return template.replace(/\{([^}]+)\}/g, (match, path) => {
                            const val = getVal(obj, path.trim());
                            // Handle text node object { "#text": "value" }
                            if (val && typeof val === 'object' && val['#text']) return val['#text'];
                            return val !== undefined ? val : '';
                        });
                    }
                    const val = getVal(obj, template);
                    if (val && typeof val === 'object' && val['#text']) return val['#text'];
                    return val;
                };

                return {
                    title: processTemplate(item, titleSelector),
                    link: processTemplate(item, linkSelector),
                    description: processTemplate(item, descSelector),
                    pubDate: processTemplate(item, dateSelector),
                    guid: item.guid ? (item.guid['#text'] || item.guid) : null
                };
            });

            channel = {
                title: channelTitle || config.key || 'Custom XML Feed',
                link: url,
                description: channelDesc || config.key || url,
            };

            log(`[Feed] Custom mode extracted ${items.length} items`);
            if (items.length > 0) {
                log(`[Feed] First item sample: title="${items[0].title}", link="${items[0].link}", desc length=${items[0].description?.length || 0}`);
            }
        } else {
            // Default Standard Parsing (Cheerio)
            log('[Feed] Using standard RSS/Atom parser');
            let $;
            try {
                $ = cheerio.load(text, { xmlMode: true });
            } catch (e) {
                throw new Error('Failed to parse XML with Cheerio: ' + e.message);
            }

            let feedTitle = '';
            let feedDesc = '';

            // Detect Feed Type (RSS or Atom)
            const isAtom = $('feed').length > 0;
            const isRss = $('rss').length > 0 || $('channel').length > 0;

            if (isAtom) {
                // Atom Parsing
                log('[Feed] Detected Atom feed');
                feedTitle = $('feed > title').text();
                feedDesc = $('feed > subtitle').text();

                $('entry').each((i, el) => {
                    if (i >= maxItems) return false;
                    const $el = $(el);

                    // Handle Atom Links
                    let link = $el.find('link[rel="alternate"]').attr('href');
                    if (!link) link = $el.find('link').attr('href'); // Fallback

                    // Use .html() to preserve full content with HTML tags
                    let desc = $el.find('content').html() || $el.find('summary').html();
                    if (desc) {
                        desc = desc.replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '');
                        // Unescape to fix double escaping if source used entities
                        desc = unescapeHtml(desc);
                    }

                    items.push({
                        title: $el.find('title').text(),
                        link: link,
                        description: desc || '',
                        pubDate: $el.find('published').text() || $el.find('updated').text(),
                        guid: $el.find('id').text()
                    });
                });
            } else {
                // RSS Parsing (1.0, 2.0)
                log('[Feed] Detected RSS feed');
                feedTitle = $('channel > title').text();
                feedDesc = $('channel > description').text();

                $('item').each((i, el) => {
                    if (i >= maxItems) return false;
                    const $el = $(el);

                    // Use .html() to preserve full content with HTML tags
                    // .text() strips all HTML which breaks formatting
                    let desc = $el.find('content\\:encoded').html() || $el.find('description').html();

                    // Handle CDATA: if wrapped in CDATA, cheerio may return it as-is
                    // Strip CDATA wrapper if present
                    if (desc) {
                        desc = desc.replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '');
                        // Unescape to fix double escaping if source used entities
                        desc = unescapeHtml(desc);
                    }

                    items.push({
                        title: $el.find('title').text(),
                        link: $el.find('link').text(),
                        description: desc || '',
                        pubDate: $el.find('pubDate').text() || $el.find('dc\\:date').text(),
                        guid: $el.find('guid').text()
                    });
                });
            }

            channel = {
                title: channelTitle || feedTitle || 'RSS Feed',
                link: url,
                description: channelDesc || feedDesc || config.key || url,
            };
            log(`[Feed] Standard mode parsed ${items.length} items`);
            if (items.length > 0) {
                log(`[Feed] First item sample: title="${items[0].title}", link="${items[0].link}", desc length=${items[0].description?.length || 0}`);
            }
        }

        // Full Text Fetching Logic
        log(`[Feed] Checking full text: fullText=${fullText}, selector="${fullTextSelector}", items=${items.length}`);
        if (fullText && fullTextSelector && items.length > 0) {
            log(`[Full Text] Starting to fetch full content for ${items.length} items`);

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

                    log(`[Full Text] Fetching: ${fetchUrl}`);
                    const articleResp = await fetchWithHeaders(fetchUrl);

                    if (!articleResp.ok) {
                        log(`[Full Text] HTTP Error ${articleResp.status} for ${fetchUrl}`);
                        fullTextItems.push(item);
                        continue;
                    }

                    const articleHtml = await decodeText(articleResp, encoding);
                    const $article = cheerio.load(articleHtml);

                    // Extract full content
                    let fullContent = '';
                    if (fullTextSelector) {
                        const contentEl = $article(fullTextSelector);
                        if (contentEl.length > 0) {
                            // Fix lazy images and relative URLs
                            fixLazyImages($article, contentEl);
                            fixRelativeUrls($article, fetchUrl);

                            // Handle multiple matches
                            if (contentEl.length > 1) {
                                fullContent = contentEl.map((i, el) => $article(el).html()).get().join('<br/>');
                            } else {
                                fullContent = contentEl.html() || contentEl.text();
                            }
                        }
                    }

                    // Replace description if content found
                    if (fullContent && fullContent.trim()) {
                        fullTextItems.push({
                            ...item,
                            description: fullContent
                        });
                        log(`[Full Text] Success: ${fetchUrl} (${fullContent.length} chars)`);
                    } else {
                        log(`[Full Text] No content found for: ${fetchUrl}`);
                        fullTextItems.push(item);
                    }

                    // Delay to avoid rate limiting
                    if (i < items.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                } catch (e) {
                    log(`[Full Text] Error fetching ${item.link}: ${e.message}`);
                    fullTextItems.push(item);
                }
            }

            items = fullTextItems;
        }

        // --- Filtering ---
        const filters = config.filters || (config.filter?.enabled ? config.filter.rules : null);
        if (Array.isArray(filters) && filters.length > 0) {
            const originalCount = items.length;
            items = applyFilters(items, filters);
            log(`[Filter] Applied rules. ${originalCount} -> ${items.length} items.`);
        }

        // --- Translation ---
        if (config.translation && config.translation.enabled) {
            items = await translateItems(items, config, config.globalSettings, log);
        }



        let data;
        if (format === 'json') {
            data = JSON.stringify({
                title: channel.title,
                description: channel.description,
                items: items,
                count: items.length,
                generated: new Date().toISOString()
            }, null, 2);
        } else {
            data = itemsToRss(items, channel, format);
        }

        return {
            data: data,
            items: items,
            isError: false,
            logs: logs,
            newUrl: newUrl, // Return the new URL if it changed
            failures: response.retryFailures || [] // Return failures
        };

    } catch (error) {
        console.error('Feed Parser Error:', error);
        log(`[Feed] Error: ${error.message}`);
        return {
            data: itemsToRss([{
                title: 'Error parsing feed',
                link: url,
                description: error.message,
                pubDate: new Date().toUTCString()
            }], { title: 'Error' }, format),
            isError: true,
            message: error.message,
            logs: logs,
            failures: error.retryFailures || []
        };
    }
}
