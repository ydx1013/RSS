import * as cheerio from "cheerio"
import {itemsToRss} from "../rss.js";

export default async function (params) {
    const { param: RG, format, maxItems } = params;
    const url = `https://www.dlsite.com/maniax/circle/profile/=/maker_id/${RG}.html/per_page/30`;
    try {
        const resp = await fetch(url);
        if (!resp.ok) {
            throw new Error(`HTTP 错误！状态: ${resp.status}`);
        }
        console.log("dlsite:", RG);
        const html = await resp.text();

        const $ = cheerio.load(html);
        const title = $('#main_inner > div:nth-child(1) > h1 > span').text().trim();
        let items = [];

        const now = Date.now();

        $("#search_result_img_box > li.search_result_img_box_inner").each((i, el) => {
            const title = $(el).find("dd.work_name a").attr("title") || "";
            const link = $(el).find("dd.work_name a").attr("href") || "";
            const author = $(el).find("dd.maker_name a").first().text().trim() || "";

            let image = "";
            $(el).find("img").each((j, imgEl) => {
                let src = $(imgEl).attr("data-src") || $(imgEl).attr("src") || "";
                if (src && !src.startsWith("data:")) {
                    image = src;
                    return false;
                }
            });
            if (image.startsWith("//")) {
                image = "https:" + image;
            }

            const price = $(el).find("span.work_price_base").first().text().trim() || "";
            const genre = $(el).find("dd div a").first().text().trim() || "";
            const sales = $(el).find("dd.work_dl span").text().trim() || "";

            let fullImage = image.startsWith("//") ? "https:" + image : image;
            fullImage = fullImage.replace("/resize/", "/modpub/").replace(/main_240x240\.jpg$/, "main.webp");
            let image1 = fullImage.replace("_main.webp", "_smp1.webp");
            let image2 = fullImage.replace("_main.webp", "_smp2.webp");

            const desc = `<![CDATA[
作者: ${author}<br/>
类型: ${genre}<br/>
价格: ${price}<br/>
销量: ${sales}<br/>
<img src="${fullImage}" /><br/>
<img src="${image1}" /><br/>
<img src="${image2}" />
]]>`;

            items.push({
                title,
                link,
                description: desc,
                author,
                enclosure: fullImage ? { url: fullImage, type: "image/jpeg", length: "0" } : undefined,
                guid: link,
                // 使用抓取顺序生成时间戳，保证 RSS 排序正确
                pubDate: new Date(now - i * 1000).toUTCString(),
            });
        });

        if (items.length > maxItems) {
            items = items.slice(0, maxItems);
        }

        const channel = {
            title: `${title} - DLSite`,
            description: `${title} - DLSite`,
            link: url,
            image: "https://www.dlsite.com/favicon.ico"
        };

        return {
            data: itemsToRss(items, channel, format),
            isError: false,
        };
    } catch (error) {
        console.error('DLsite RSS 生成错误:', error);
        const errorItems = [{
            title: 'DLsite RSS 访问错误',
            link: url,
            description: `<![CDATA[<h3>访问 DLsite 网站时发生错误</h3><p><strong>错误信息：</strong>${error.message}</p>]]>`,
            author: 'System',
            guid: `error-dlsite-${Date.now()}`,
            pubDate: new Date().toUTCString(),
        }];
        const channel = {
            title: 'DLsite RSS - 错误',
            description: 'DLsite RSS 访问出现错误',
            link: url,
            image: "https://www.dlsite.com/favicon.ico"
        };
        return {
            data: itemsToRss(errorItems, channel, format),
            isError: true,
        };
    }
}
