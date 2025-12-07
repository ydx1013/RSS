import * as cheerio from "cheerio"
import {itemsToRss} from "../rss.js";

export default async function (params) {
    const { param: model, format, maxItems } = params;
    const url = `https://cospuri.com/model/${model}`;
    try {
        const resp = await fetch(url);
        if (!resp.ok) {
            throw new Error(`HTTP 错误！状态: ${resp.status}`);
        }
        console.log("cospuri:", model);
        const html = await resp.text();
        const $ = cheerio.load(html);
        const title = $('div.name-en').text().trim();

        let items = [];
        const now = Date.now();

        $(".scene.cosplay").each((i, el) => {
            const title = $(el).find(".model a").first().text().trim() || "Cospuri Scene";
            const link = $(el).find("a").first().attr("href") || "";
            const author = $(el).find(".model a").first().text().trim() || "";

            // 主图（背景图）
            let image = "";
            const bgStyle = $(el).find(".scene-thumb").attr("style") || "";
            const match = bgStyle.match(/url\(([^)]+)\)/);
            if (match) {
                image = match[1].replace(/['"]/g, "");
                if (!image.startsWith("http")) image = "https://www.cospuri.com" + image;
            }

            // 标签
            const tags = $(el).find(".tags a").map((j, tagEl) => $(tagEl).text().trim()).get().join(", ");

            const desc = `<![CDATA[
模特: ${author}<br/>
标签: ${tags}<br/>
<img src="${image}" />
]]>`;

            items.push({
                title,
                link: link.startsWith("http") ? link : "https://www.cospuri.com" + link,
                description: desc,
                author,
                enclosure: image ? { url: image, type: "image/jpeg", length: "0" } : undefined,
                guid: link,
                pubDate: new Date(now - i * 1000).toUTCString()
            });
        });

        if (items.length > maxItems) {
            items = items.slice(0, maxItems);
        }

        const channel = {
            title: `${title} - Cospuri`,
            description: `${title} - Cospuri`,
            link: url,
            image: "https://cdn.cospuri.com/img/banner_1.jpg"
        };

        return {
            data: itemsToRss(items, channel, format),
            isError: false,
        };
    } catch (error) {
        console.error('Cospuri RSS 生成错误:', error);
        const errorItems = [{
            title: 'Cospuri RSS 访问错误',
            link: url,
            description: `<![CDATA[<h3>访问 Cospuri 网站时发生错误</h3><p><strong>错误信息：</strong>${error.message}</p>]]>`,
            author: 'System',
            guid: `error-cospuri-${Date.now()}`,
            pubDate: new Date().toUTCString(),
        }];
        const channel = {
            title: 'Cospuri RSS - 错误',
            description: 'Cospuri RSS 访问出现错误',
            link: url,
            image: "https://cdn.cospuri.com/img/banner_1.jpg"
        };
        return {
            data: itemsToRss(errorItems, channel, format),
            isError: true,
        };
    }
}
