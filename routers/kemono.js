import { DateTime } from "luxon";
import { itemsToRss } from "../rss.js";

export default async function (params) {
    const { param: ID, format, maxItems } = params;
    const url = `https://kemono.cr/api/v1/${ID}/posts`;
    try {
        const resp = await fetch(url, {
            headers: {
                "Accept": "application/json",
            }
        });
        if (!resp.ok) {
            throw new Error(`HTTP 错误！状态: ${resp.status}`);
        }
        console.log("kemono:", ID);
        const data = await resp.json();
        const items = [];

        const postsToProcess = data.slice(0, maxItems);

        for (const post of postsToProcess) {
            const title = post.title || "无标题";
            const link = `https://kemono.cr/${post.service}/user/${post.user}/post/${post.id}`;
            const contentHtml = post.content || ""; // 使用 'content' 字段
            const datetime = post.published || "";
            const rssTime = datetime
                ? DateTime.fromISO(datetime, { zone: 'utc' }).toRFC2822()
                : "";

            let description = contentHtml;

            // 添加附件
            if (post.attachments && post.attachments.length > 0) {
                description += "<br/><hr/><strong>附件:</strong><br/>";
                post.attachments.forEach(att => {
                    const attachmentUrl = `https://kemono.cr/data${att.path}`;
                    description += `<a href="${attachmentUrl}">${att.name}</a><br/>`;
                });
            }
            
            // 添加主图片（如果有）
            const enclosureUrl = post.file?.path
                ? `https://kemono.cr/data${post.file.path}`
                : (post.attachments && post.attachments.length > 0 ? `https://kemono.cr/data${post.attachments[0].path}` : "https://kemono.cr/static/noimage.png");

            if (enclosureUrl && enclosureUrl !== "https://kemono.cr/static/noimage.png") {
                description += `<br/><img src="${enclosureUrl}" />`;
            }

            items.push({
                title: title,
                link: link,
                description: `<![CDATA[${description}]]>`,
                author: post.user,
                guid: link,
                pubDate: rssTime,
                enclosure: {
                    url: enclosureUrl,
                    length: "0",
                    type: "image/png" // 假设为png，可根据实际情况调整
                }
            });
        }

        const channel = {
            title: `${ID} - Kemono`,
            description: `${ID} - Kemono`,
            link: `https://kemono.cr/${ID}`,
            image: "https://kemono.cr/static/apple-touch-icon.png"
        };

        return {
            data: itemsToRss(items, channel, format),
            isError: false,
        };
    } catch (error) {
        console.error('Kemono RSS 生成错误:', error);
        const errorItems = [{
            title: 'Kemono RSS 访问错误',
            link: `https://kemono.cr/${ID}`,
            description: `<![CDATA[<h3>访问 Kemono API 时发生错误</h3><p><strong>ID:</strong> ${ID}</p><p><strong>错误信息：</strong>${error.message}</p>]]>`,
            author: 'System',
            guid: `error-kemono-${ID}-${Date.now()}`,
            pubDate: new Date().toUTCString(),
        }];
        const channel = {
            title: `Kemono RSS - 错误 (${ID})`,
            description: 'Kemono RSS 访问出现错误',
            link: `https://kemono.cr/${ID}`,
            image: "https://kemono.cr/static/apple-touch-icon.png"
        };
        return {
            data: itemsToRss(errorItems, channel, format),
            isError: true,
        };
    }
}
