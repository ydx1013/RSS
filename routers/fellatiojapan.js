import * as cheerio from "cheerio"
import {itemsToRss} from "../rss.js";

export default async function (params) {
    const { param: model, format, maxItems } = params;
    const url = `https://fellatiojapan.com/en/girl/${model}`;
    try {
        const resp = await fetch(url);
        if (!resp.ok) {
            throw new Error(`HTTP 错误！状态: ${resp.status}`);
        }
        const html = await resp.text();
        const $ = cheerio.load(html);

        const pagetitle = $("#content h1").first().text().trim();

        let items = [];
        const now = Date.now();

        $(".scene-obj").each((i, el) => {
            const title = $(el).find(".sGirl a").first().text().trim() || "Fellatio Japan Scene";
            const link = $(el).find(".scene-top").attr("href") || "";
            const authors = $(el).find(".sGirl a").map((i, a) => $(a).text().trim()).get().join(", ");

            // 主图（背景图）
            let image = "";
            const bgStyle = $(el).find(".scene-img").attr("style") || "";
            const match = bgStyle.match(/url\(([^)]+)\)/);
            if (match) {
                image = match[1].replace(/['"]/g, "");
                if (!image.startsWith("http")) image = "https://cdn.fellatiojapan.com" + image;
            }

            // 标签
            const tags = $(el).find(".data.dark a").map((j, tagEl) => $(tagEl).text().trim()).get().join(", ");

            // 日期
            const date = $(el).find(".sDate").text().trim();

            const desc = `<![CDATA[
模特: ${authors}<br/>
标签: ${tags}<br/>
日期: ${date}<br/>
<img src="${image}" />
]]>`;

            items.push({
                title,
                link: link.startsWith("http") ? link : url,
                description: desc,
                author: authors,
                enclosure: image ? { url: image, type: "image/jpeg", length: "0" } : undefined,
                guid: image,
                pubDate: date ? new Date(date).toUTCString() : new Date(now - i * 1000).toUTCString()
            });
        });

        if (items.length > maxItems) {
            items = items.slice(0, maxItems);
        }

        const channel = {
            title: `${pagetitle} - Fellatio Japan`,
            description: `${pagetitle} - Fellatio Japan`,
            link: url,
            image: "https://cdn.fellatiojapan.com/img/svg2.png"
        };

        return {
            data: itemsToRss(items, channel, format),
            isError: false,
        };
    } catch (error) {
        console.error('Fellatio Japan RSS 生成错误:', error);
        const errorItems = [{
            title: 'Fellatio Japan RSS 访问错误',
            link: url,
            description: `<![CDATA[<h3>访问 Fellatio Japan 网站时发生错误</h3><p><strong>错误信息：</strong>${error.message}</p>]]>`,
            author: 'System',
            guid: `error-fellatiojapan-${Date.now()}`,
            pubDate: new Date().toUTCString(),
        }];
        const channel = {
            title: 'Fellatio Japan RSS - 错误',
            description: 'Fellatio Japan RSS 访问出现错误',
            link: url,
            image: "https://cdn.fellatiojapan.com/img/svg2.png"
        };
        return {
            data: itemsToRss(errorItems, channel, format),
            isError: true,
        };
    }
}
