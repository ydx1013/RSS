import { itemsToRss } from "../rss.js";
import { DateTime } from "luxon";

/*
 * tracker 路由
 * 用法: ?tracker=<UUID>
 * 访问固定 API 前缀 + UUID 返回稿件跟踪 JSON
 * 示例: https://.../ ?tracker=4427ecae-5e92-4698-be45-3c7a56030262
 */
export default async function (params) {
    const { param: UUID, format, maxItems } = params;
    const base = 'https://tnlkuelk67.execute-api.us-east-1.amazonaws.com/tracker';
    const apiUrl = `${base}/${UUID}`;

    try {
        if (!UUID) {
            throw new Error('缺少 UUID');
        }

        const resp = await fetch(apiUrl, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (compatible; WorkerRSS/1.0)'
            }
        });
        if (!resp.ok) {
            throw new Error(`API 请求失败: ${resp.status}`);
        }
        const data = await resp.json();

    // 组装单条 item
    // 为了让 RSS 阅读器识别“更新”，需要让标题或 guid 发生变化；之前标题固定为 “FirstAuthor (CorrespondingAuthor)”
    // 很多阅读器只在 guid 或 (title + link) 变化时才会认为是新内容，因此这里将状态 & 更新时间编码进标题与 guid。
    const lastUpdatedSeconds = data.LastUpdated || Math.floor(Date.now() / 1000);
    const lastUpdatedRfc2822 = DateTime.fromSeconds(lastUpdatedSeconds, { zone: 'utc' }).toRFC2822();
    const lastUpdatedForTitle = DateTime.fromSeconds(lastUpdatedSeconds, { zone: 'utc' }).toFormat('yyyy-LL-dd HH:mm');
    const submissionDateISO = data.SubmissionDate ? DateTime.fromSeconds(data.SubmissionDate, { zone: 'utc' }).toISO() : '';

        const statusMap = {
            0: 'Unknown',
            1: 'Submitted',
            2: 'With Editor',
            3: 'Under Review',
            4: 'Revision Requested',
            5: 'Accepted',
            6: 'Rejected'
        };

        const statusText = statusMap[data.Status] || `Status ${data.Status}`;

        const reviewSummaryHtml = data.ReviewSummary ? `<ul>
            <li>Reviews Completed: ${data.ReviewSummary.ReviewsCompleted}</li>
            <li>Invitations Accepted: ${data.ReviewSummary.ReviewInvitationsAccepted}</li>
            <li>Invitations Sent: ${data.ReviewSummary.ReviewInvitationsSent}</li>
        </ul>` : '';

        const description = `<![CDATA[
            <p><strong>Manuscript Title:</strong> ${data.ManuscriptTitle || ''}</p>
            <p><strong>Journal:</strong> ${data.JournalName || ''} (${data.JournalAcronym || ''})</p>
            <p><strong>Pubd Number:</strong> ${data.PubdNumber || ''}</p>
            <p><strong>Submission Date:</strong> ${submissionDateISO}</p>
            <p><strong>Status:</strong> ${statusText}</p>
            <h4>Review Summary</h4>
            ${reviewSummaryHtml}
        ]]>`;

        // 动态标题示例: "Bangxu Wu (Yingying Zou) - Under Review @ 2025-10-08 12:34"
        // 动态 GUID: 原始 UUID + 状态 + 更新时间秒，保证每次状态变化或系统更新时间变化都会生成新条目
        const dynamicGuid = `${data.Uuid || UUID}-${data.Status || 'NA'}-${lastUpdatedSeconds}`;
        let items = [{
            title: `${data.FirstAuthor || 'Unknown'} (${data.CorrespondingAuthor || ''}) - ${statusText} @ ${lastUpdatedForTitle}`,
            link: apiUrl,
            description,
            author: data.CorrespondingAuthor || data.FirstAuthor || 'Unknown',
            guid: dynamicGuid,
            pubDate: lastUpdatedRfc2822,
            enclosure: {
                url: 'https://upload.wikimedia.org/wikipedia/commons/5/5a/Academic_Cap.svg',
                length: '0',
                type: 'image/svg+xml'
            }
        }];

        if (items.length > maxItems) {
            items = items.slice(0, maxItems);
        }

        const channel = {
            title: `${data.FirstAuthor || 'Unknown'} 稿件进度追踪 - ${statusText}` ,
            description: `Corresponding Author: ${data.CorrespondingAuthor || ''}; Last Updated: ${lastUpdatedForTitle} UTC` ,
            link: apiUrl,
            image: 'https://upload.wikimedia.org/wikipedia/commons/5/5a/Academic_Cap.svg'
        };

        return {
            data: itemsToRss(items, channel, format),
            isError: false
        };

    } catch (error) {
        console.error('tracker 路由错误:', error);
        const items = [{
            title: 'Tracker Error',
            link: apiUrl,
            description: `<![CDATA[请求稿件跟踪失败: ${error.message}]]>`,
            author: 'System',
            guid: `tracker-error-${UUID}-${Date.now()}`,
            pubDate: new Date().toUTCString()
        }];
        const channel = {
            title: 'Tracker Error',
            description: '稿件跟踪接口访问失败',
            link: apiUrl,
            image: 'https://upload.wikimedia.org/wikipedia/commons/5/5a/Academic_Cap.svg'
        };
        return {
            data: itemsToRss(items, channel, format),
            isError: true
        };
    }
}
