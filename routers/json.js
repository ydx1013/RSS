import { itemsToRss } from '../rss.js';

export default async function (params, config) {
    const { format = 'rss' } = params;
    const { 
        url, 
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
        timestampMode = false, 
        timestampUnit = 'ms',
        reverseOrder = false
    } = config;

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }

        const data = await response.json();
        
        // Helper to get value from object by path (supports nested paths, arrays, wildcards)
        const getVal = (obj, path) => {
            if (!path) return '';
            if (path === '.') return obj; // 返回整个对象
            
            try {
                // 分割路径，支持 . 和 [] 语法
                const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
                let current = obj;
                
                for (const part of parts) {
                    if (!part) continue;
                    
                    // 处理数组索引
                    if (!isNaN(part)) {
                        current = current[parseInt(part)];
                    } else {
                        current = current?.[part];
                    }
                    
                    if (current === undefined || current === null) return '';
                }
                
                // 如果结果是对象或数组，转换为字符串
                if (typeof current === 'object') {
                    return JSON.stringify(current);
                }
                
                return String(current);
            } catch(e) {
                console.error('JSON path error:', path, e);
                return '';
            }
        };
        
        // 获取列表数据
        let list = itemSelector ? getVal(data, itemSelector) : data;
        
        // 如果获取到的是字符串（JSON字符串），尝试解析
        if (typeof list === 'string') {
            try {
                list = JSON.parse(list);
            } catch(e) {
                console.error('JSON parse error:', e);
                list = [];
            }
        }
        
        // Helper to process template string with placeholders like {user.name}
        const processTemplate = (obj, template) => {
            if (!template) return '';
            
            // If template contains { and }, treat as template
            if (template.includes('{') && template.includes('}')) {
                return template.replace(/\{([^}]+)\}/g, (match, path) => {
                    const val = getVal(obj, path.trim());
                    return val !== undefined ? val : '';
                });
            }
            
            // Otherwise treat as direct path
            return getVal(obj, template);
        };

        let items = [];
        if (Array.isArray(list)) {
            // 如果需要倒序，先倒序
            if (reverseOrder) {
                list = list.reverse();
            }

            items = list.slice(0, maxItems).map(item => {
                let link = processTemplate(item, linkSelector) || '';
                
                // 如果启用了链接拼接，处理相对URL
                if (linkNeedJoin && link && !link.startsWith('http')) {
                    try {
                        const baseUrl = linkBaseUrl ? new URL(linkBaseUrl) : new URL(url);
                        link = new URL(link, baseUrl).href;
                    } catch(e) {
                        console.error('URL处理错误:', e);
                    }
                }
                
                // 处理日期
                let pubDate = new Date().toUTCString();
                if (dateSelector) {
                    // Date selector usually is a single path, but we can support template too
                    // If it's a template, the result string will be parsed
                    const dateVal = processTemplate(item, dateSelector);
                    if (dateVal) {
                        try {
                            // 时间戳模式
                            if (timestampMode && typeof dateVal === 'number') {
                                const timestamp = timestampUnit === 's' ? dateVal * 1000 : dateVal;
                                pubDate = new Date(timestamp).toUTCString();
                            } 
                            // 字符串时间戳
                            else if (timestampMode && typeof dateVal === 'string' && !isNaN(dateVal) && /^\d+$/.test(dateVal)) {
                                const numVal = parseInt(dateVal);
                                const timestamp = timestampUnit === 's' ? numVal * 1000 : numVal;
                                pubDate = new Date(timestamp).toUTCString();
                            }
                            // 自动检测（兼容旧配置）
                            else if (typeof dateVal === 'number') {
                                const timestamp = dateVal > 9999999999 ? dateVal : dateVal * 1000;
                                pubDate = new Date(timestamp).toUTCString();
                            } 
                            // 日期字符串
                            else {
                                pubDate = new Date(dateVal).toUTCString();
                            }
                        } catch(e) {
                            console.error('日期解析错误:', e);
                        }
                    }
                }

                return {
                    title: processTemplate(item, titleSelector) || 'No title',
                    link: link || url,
                    description: processTemplate(item, descSelector) || '',
                    pubDate: pubDate
                };
            });
        }

        const channel = {
            title: channelTitle || 'Custom JSON Feed',
            description: channelDesc || `Generated from ${url}`,
            link: url,
            image: "https://github.githubassets.com/favicons/favicon.png"
        };

        return {
            data: itemsToRss(items, channel, format),
            items: items, // Return raw items for preview
            isError: false,
        };

    } catch (error) {
        console.error('JSON Router Error:', error);
        const errorItems = [{
            title: 'Error fetching JSON feed',
            link: url,
            description: error.message,
            pubDate: new Date().toUTCString()
        }];
        const errorChannel = {
            title: 'Error',
            description: 'Error fetching feed',
            link: url
        };
        return {
            data: itemsToRss(errorItems, errorChannel, format),
            isError: true,
            message: error.message // Add error message
        };
    }
}
