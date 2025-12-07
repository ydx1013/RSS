// routers/custom.js
// 自定义 RSS 路由器 - 执行用户配置的 RSS 规则

import * as cheerio from "cheerio";
import { itemsToRss } from "../rss.js";

export default async function (params) {
    const { param: configId, workerUrl, format, maxItems } = params;

    try {
        // 从 KV 获取配置
        if (!params.env || !params.env.RSS_KV) {
            throw new Error('KV 未配置');
        }

        const configData = await params.env.RSS_KV.get(`custom_rss:${configId}`, { type: 'json' });
        
        if (!configData) {
            throw new Error(`未找到配置: ${configId}`);
        }

        const { url, selectors, channelInfo } = configData;

        // 获取网页内容
        console.log('Custom RSS: 获取', url);
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
        const limit = maxItems || configData.maxItems || 20;

        $(containerSelector).each((index, element) => {
            if (index >= limit) return false;

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

        const rss = itemsToRss(items, channel, format);

        return {
            data: rss,
            isError: false
        };

    } catch (error) {
        console.error('自定义 RSS 错误:', error);
        
        const errorItems = [{
            title: '自定义 RSS 生成失败',
            link: workerUrl,
            description: `<![CDATA[
                <h3>⚠️ 错误信息</h3>
                <p><strong>配置 ID:</strong> ${configId}</p>
                <p><strong>错误:</strong> ${error.message}</p>
                <p><strong>提示:</strong> 请在管理后台检查配置是否正确</p>
            ]]>`,
            author: 'System',
            guid: `error-custom-${configId}-${Date.now()}`,
            pubDate: new Date().toUTCString()
        }];

        const errorChannel = {
            title: `自定义 RSS - 错误 (${configId})`,
            link: workerUrl,
            description: '自定义 RSS 生成失败',
            image: `${workerUrl}/favicon.ico`
        };

        return {
            data: itemsToRss(errorItems, errorChannel, format),
            isError: true
        };
    }
}
