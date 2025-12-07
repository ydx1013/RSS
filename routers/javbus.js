import * as cheerio from "cheerio"
import {itemsToRss} from "../rss.js";

export default async function (params) {
    const { param: actorId, workerUrl, format, maxItems } = params;
    const url = `https://www.javbus.com/star/${actorId}`;
    try {
        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3"
            }
        });
        const body = await response.text();
        const $ = cheerio.load(body);

        const actorName = $("div.avatar-box .photo-info span.pb10").first().text().trim() ||
            $("title").text().split("-")[0].trim();

        let items = [];
        $("a.movie-box").each((i, el) => {
            const a = $(el);
            const link = a.attr("href");
            const title = a.find("span.badge").text().trim();
            const pubDate = new Date(a.find("span.date").text().trim()).toUTCString();

            items.push({
                title,
                link,
                guid: link || `${actorId}-${i}`,
                pubDate
            });
        });

        if (items.length > maxItems) {
            items = items.slice(0, maxItems);
        }

        const channel = {
            title: `${actorName} - JavBus`,
            link: url,
            description: `Latest movies and updates for actor ${actorName}`,
            language: "en-US",
            copyright: "javbus.com",
            pubDate: new Date().toUTCString(),
        };

        return {
            data: itemsToRss(items, channel, format),
            isError: false,
        };
    } catch (error) {
        return {
            data: error.message,
            isError: true,
        };
    }
}
