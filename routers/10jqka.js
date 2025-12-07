import { itemsToRss } from '../rss.js';

export default async function (params) {
    const { param, format, maxItems } = params;
    const url = `https://news.10jqka.com.cn/tapp/news/push/stock/?page=1&tag=&track=website&pagesize=100`;
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
                'Accept': 'application/json',
            },
        });
        if (!response.ok) {
            throw new Error(`HTTP 错误！状态: ${response.status}`);
        }
        const data = await response.json();
        let list = data.data.list;

        // 限制文章数量
        if (list.length > maxItems) {
            list = list.slice(0, maxItems);
        }

        const items = list.map((item) => {
            return {
                title: item.title,
                link: item.url,
                description: `<![CDATA[${item.digest}]]>`,
                pubDate: new Date(item.ctime * 1000).toUTCString(),
            };
        });

        const channel = {
            title: '同花顺 - 财经资讯',
            link: 'https://news.10jqka.com.cn/',
            description: '同花顺财经提供7x24小时财经资讯及全球金融市场报价，覆盖股票、债券、基金、期货、信托、理财、管理等多种面向个人和企业的服务。',
            image: 'https://www.10jqka.com.cn/favicon.ico',
        };

        return {
            data: itemsToRss(items, channel, format),
            isError: false,
        };
    } catch (error) {
        console.error('10jqka RSS 生成错误:', error);
        const errorItems = [{
            title: '10jqka RSS 访问错误',
            link: url,
            description: `<![CDATA[<h3>访问 10jqka API 时发生错误</h3><p><strong>错误信息：</strong>${error.message}</p>]]>`,
            author: 'System',
            guid: `error-10jqka-${Date.now()}`,
            pubDate: new Date().toUTCString(),
        }];
        const channel = {
            title: '10jqka RSS - 错误',
            description: '10jqka RSS 访问出现错误',
            link: 'https://news.10jqka.com.cn/',
            image: 'https://www.10jqka.com.cn/favicon.ico'
        };
        return {
            data: itemsToRss(errorItems, channel, format),
            isError: true,
        };
    }
}
