import * as cheerio from "cheerio";
import { itemsToRss } from "../rss.js";

// 异步函数，用于抓取并解析单个文章的全文内容
async function fetchArticleContent(url) {
    try {
        const resp = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            }
        });
        if (!resp.ok) {
            console.error(`抓取文章内容失败 ${url}: ${resp.status}`);
            return { content: '无法加载全文', author: '未知', pubDate: new Date().toUTCString() };
        }
        const buffer = await resp.arrayBuffer();
        const html = new TextDecoder('gbk').decode(buffer);
        const $ = cheerio.load(html);

        // 提取文章正文
        const contentElement = $('.content-intro.typo');
        
        // 修正图片链接，将相对路径转换为绝对路径
        contentElement.find('img').each((i, el) => {
            const img = $(el);
            let src = img.attr('src');
            if (src && !src.startsWith('http')) {
                img.attr('src', `https://www.iqnew.com${src}`);
            }
        });

        const content = contentElement.html() || '无法提取内容';

        // 提取作者和精确的发布时间
        const author = $('.meta .author a').text().trim() || '未知';
        const timeStr = $('.meta .time').text().trim();
        const pubDate = timeStr ? new Date(timeStr).toUTCString() : new Date().toUTCString();

        return { content, author, pubDate };
    } catch (error) {
        console.error(`抓取文章内容时出错 ${url}:`, error);
        return { content: `加载全文出错: ${error.message}`, author: '未知', pubDate: new Date().toUTCString() };
    }
}

export default async function (params) {
    const { format, maxItems } = params;
    const url = 'https://www.iqnew.com/post/new_100/';
    
    try {
        const resp = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            }
        });
        if (!resp.ok) {
            throw new Error(`HTTP 错误！状态: ${resp.status}`);
        }
        const buffer = await resp.arrayBuffer();
        const html = new TextDecoder('gbk').decode(buffer);
        const $ = cheerio.load(html);

        const listItems = $('.list-wrap .list-item li').toArray().slice(0, maxItems);
        
        const itemPromises = listItems.map(async (el) => {
            const a = $(el).find('a');
            const title = a.attr('title') || a.text().trim();
            const relativeLink = a.attr('href');
            
            if (!relativeLink) return null;

            const link = `https://www.iqnew.com${relativeLink}`;
            
            // 并发获取全文内容
            const { content, author, pubDate } = await fetchArticleContent(link);

            return {
                title: title,
                link: link,
                description: `<![CDATA[${content}]]>`,
                author: author,
                pubDate: pubDate,
                guid: link,
            };
        });

        const items = (await Promise.all(itemPromises)).filter(Boolean);

        const channel = {
            title: '爱Q生活网 - 最新线报',
            link: url,
            description: '爱Q生活网（www.iqnew.com）是一个免费分享活动线报、QQ技术、软件、教程、资源的综合性网站。',
            image: 'https://www.iqnew.com/favicon.ico'
        };

        return {
            data: itemsToRss(items, channel, format),
            isError: false
        };

    } catch (error) {
        console.error('iqnew RSS 生成错误:', error);
        // 返回错误信息的RSS
        const errorItems = [{
            title: 'iqnew RSS 访问错误',
            link: url,
            description: `<![CDATA[<h3>访问 iqnew 网站时发生错误</h3><p><strong>错误信息：</strong>${error.message}</p>]]>`,
            author: 'System',
            guid: `error-${Date.now()}`,
            pubDate: new Date().toUTCString(),
        }];
        const channel = {
            title: 'iqnew RSS - 错误',
            description: 'iqnew RSS 访问出现错误',
            link: url,
            image: 'https://www.iqnew.com/favicon.ico'
        };
        return {
            data: itemsToRss(errorItems, channel, format),
            isError: true
        };
    }
}
