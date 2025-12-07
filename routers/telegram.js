import * as cheerio from "cheerio"
import { itemsToRss } from "../rss.js"
import { DateTime } from "luxon"

export default async function (params) {
    const { param: ID, format, maxItems } = params;
    try {
        if (!ID) {
            throw new Error("缺少 Telegram channel/group ID");
        }

        // 检测 Telegram ID 类型并构建正确的 URL
        let telegramUrl;
        let contentType;

        if (ID.startsWith('+')) {
            // 群组邀请链接格式: +ABC123...
            telegramUrl = `https://t.me/${ID}`;
            contentType = 'group';
        } else if (ID.startsWith('joinchat/')) {
            // 旧版群组邀请链接格式: joinchat/ABC123...
            telegramUrl = `https://t.me/${ID}`;
            contentType = 'group';
        } else {
            // 频道或机器人格式: 频道名或机器人名
            telegramUrl = `https://t.me/s/${ID}`;
            contentType = 'channel';
        }

        console.log(`Telegram URL: ${telegramUrl}, Type: ${contentType}`);

        const resp = await fetch(telegramUrl);
        if (!resp.ok) {
            throw new Error(`获取 Telegram ${contentType} 失败: ${resp.status} ${resp.statusText}`);
        }
        const html = await resp.text();
        const $ = cheerio.load(html);
        const fullTitle = $("title").text().trim();
        console.log(`Telegram title: "${fullTitle}"`);
        
        // 更好的标题解析：移除 " - Telegram" 后缀
        let title = fullTitle.replace(/\s*-\s*Telegram\s*$/, '').trim();
        if (!title || title === 'Telegram') {
            title = ID; // 如果解析失败，使用频道ID作为标题
        }
        
        const description = $('meta[name="description"]').attr("content") || "无";
        let items = [];

        const elements = $(".tgme_widget_message_wrap").toArray();
        console.log(`Found ${elements.length} message elements`);
        
        // 检查频道/群组是否存在
        if ($('.tgme_widget_message_wrap').length === 0) {
            // 检查是否是错误页面或内容不存在
            const bodyText = $('body').text().toLowerCase();
            if (bodyText.includes('not found') || bodyText.includes('channel') && bodyText.includes('not') || 
                fullTitle === 'Telegram' || fullTitle.includes('not found') ||
                bodyText.includes('group') && bodyText.includes('not')) {
                throw new Error(`${contentType === 'group' ? '群组' : '频道'} "${ID}" 不存在或未公开`);
            }
            // 如果页面没有消息，但看起来是正常的页面，可能是没有消息
            if ($('.tgme_channel_info').length > 0 || $('.tgme_page_title').length > 0 || 
                $('.tgme_page').length > 0) {
                console.log(`${contentType} "${ID}" 存在但没有消息`);
            }
        }
        
        const elementsToProcess = elements.slice(0, maxItems);

        for (const el of elementsToProcess) {
            console.log(`Processing message element ${elementsToProcess.indexOf(el) + 1}/${elementsToProcess.length}`);
            const link = $(el).find("a.tgme_widget_message_date").attr("href") || "";
            const author = $(el).find(".tgme_widget_message_owner_name").text().trim() || "";
            const datetime = $(el).find("time").attr("datetime") || "";
            const rssTime = datetime ? DateTime.fromISO(datetime, { zone: "utc" }).toRFC2822() : "";

            // 获取消息文本元素
            const textElement = $(el).find(".tgme_widget_message_text");

            // 处理投票
            const pollElement = $(el).find(".tgme_widget_message_poll");
            let pollContent = "";
            
            // 智能提取标题
            let itemTitle = "无标题";

            if (pollElement.length > 0) {
                const pollQuestion = pollElement.find(".tgme_widget_message_poll_question").text().trim();
                if (pollQuestion) {
                    itemTitle = `[投票] ${pollQuestion}`;
                }

                const pollOptions = [];
                pollElement.find(".tgme_widget_message_poll_option").each((i, optionEl) => {
                    const optionText = $(optionEl).find(".tgme_widget_message_poll_option_text").text().trim();
                    pollOptions.push(`<li>${optionText}</li>`);
                });

                const pollVotes = pollElement.find(".tgme_widget_message_poll_votes").text().trim();

                pollContent = `
                    <br>
                    <div style="border: 1px solid #ddd; padding: 10px; border-radius: 5px;">
                        <h4>${pollQuestion}</h4>
                        <ul>${pollOptions.join('')}</ul>
                        <p><strong>${pollVotes}</strong></p>
                    </div>
                `;
            }
            
            // 方法1：寻找包含实际文字内容的<b>标签（排除只有emoji的<b>标签）
            const boldElements = textElement.find("b");
            let foundTitle = false;
            
            boldElements.each((index, boldEl) => {
                const boldText = $(boldEl).text().trim();
                // 如果<b>标签内容长度大于3且包含非emoji字符，认为是标题
                if (boldText.length > 3 && /[\u4e00-\u9fff\w]/.test(boldText)) {
                    itemTitle = boldText;
                    foundTitle = true;
                    return false; // 找到就退出循环
                }
            });
            
            // 方法2：如果没找到合适的<b>标签，尝试从文本中提取标题
            if (!foundTitle) {
                const fullText = textElement.text().trim();
                if (fullText) {
                    // 移除开头的emoji和空白字符，取第一行有实际内容的文本
                    const lines = fullText.split('\n');
                    for (let line of lines) {
                        const cleanLine = line.trim();
                        // 寻找第一行有实际文字内容的行作为标题
                        if (cleanLine.length > 5 && /[\u4e00-\u9fff\w]/.test(cleanLine)) {
                            itemTitle = cleanLine;
                            break;
                        }
                    }
                }
            }

            // 获取完整的HTML内容
            let htmlContent = textElement.html() || "";
            
            // 处理图片
            const photo = $(el).find("a.tgme_widget_message_photo_wrap").css("background-image") || "";
            const photoUrl = photo.replace(/^url\(['"]?/, "").replace(/['"]?\)$/, "");

            // 处理视频
            const video = $(el).find(".tgme_widget_message_video_wrap video").attr("src") || "";
            
            // 组合内容
            let contentParts = [];
            if (htmlContent) {
                contentParts.push(htmlContent);
            }
            if (pollContent) {
                contentParts.push(pollContent);
            }
            if (photoUrl) {
                contentParts.push(`<br><img src="${photoUrl}" style="max-width: 100%; height: auto;" />`);
            }
            if (video) {
                contentParts.push(`<br><video controls style="max-width: 100%; height: auto;"><source src="${video}" type="video/mp4" /></video>`);
            }

            const content = `<![CDATA[${contentParts.join('')}]]>`;

            // 确定enclosure（优先级：图片 > 视频 > 默认logo）
            let enclosureUrl = "https://telegram.org/img/t_logo.png";
            let enclosureType = "image/png";
            
            if (photoUrl) {
                enclosureUrl = photoUrl;
                enclosureType = "image/jpeg";
            } else if (video) {
                enclosureUrl = video;
                enclosureType = "video/mp4";
            }

            items.push({
                title: itemTitle,
                link: link,
                description: content,
                author: author,
                guid: link,
                pubDate: rssTime,
                enclosure: {
                    url: enclosureUrl,
                    length: "0",
                    type: enclosureType
                }
            });
        }

        const channel = {
            title: title || ID,
            description: `${title || ID} - Telegram ${contentType === 'group' ? '群组' : '频道'}`,
            link: contentType === 'group' ? `https://t.me/${ID}` : `https://t.me/s/${ID}`,
            image: "https://telegram.org/img/t_logo.png"
        };

        return {
            data: itemsToRss(items, channel, format),
            isError: items.length === 0
        };
    } catch (error) {
        console.error(`Telegram processor error: ${error.message}`, error);
        // 确定正确的链接格式
        let errorLink;
        if (ID.startsWith('+')) {
            errorLink = `https://t.me/${ID}`;
        } else if (ID.startsWith('joinchat/')) {
            errorLink = `https://t.me/${ID}`;
        } else {
            errorLink = `https://t.me/s/${ID}`;
        }

        const items = [{
            title: 'Telegram Processor Error',
            link: errorLink,
            description: `Error processing Telegram feed: ${error.message}`,
            author: "RSS Worker",
            guid: `tg-error-${ID}-${Date.now()}`,
            pubDate: new Date().toUTCString(),
        }];
        const channel = {
            title: 'Telegram Processor Error',
            description: 'An error occurred while processing the Telegram feed.',
            link: errorLink,
            image: "https://telegram.org/img/t_logo.png"
        };
        return {
            data: itemsToRss(items, channel, format),
            isError: true,
        };
    }
}

