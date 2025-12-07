import * as cheerio from "cheerio"
import { itemsToRss } from "../rss.js"

export default async function (params) {
    const { param: userId, workerUrl, format, maxItems } = params;

    // Bilibili 对 Cloudflare Workers 有 IP 限制，无法正常访问 API
    const errorItems = [{
        title: 'Bilibili 路由器暂时不可用',
        link: `https://space.bilibili.com/${userId}`,
        description: `<![CDATA[
<h3>⚠️ 服务限制说明</h3>
<p>Bilibili 对 Cloudflare Workers 的 IP 地址有限制，导致无法正常访问其 API。</p>
<p><strong>建议替代方案：</strong></p>
<ul>
<li>直接访问 Bilibili 网站：<a href="https://space.bilibili.com/${userId}">https://space.bilibili.com/${userId}</a></li>
<li>使用 RSS 订阅工具直接订阅 Bilibili 用户</li>
<li>等待未来可能的 API 访问权限恢复</li>
</ul>
<p><strong>技术说明：</strong></p>
<p>本地测试确认 API 可以正常工作，但在 Cloudflare Workers 环境中返回 412 错误，表明服务器级别的访问限制。</p>
]]>`
    }];

    const errorChannel = {
        title: `Bilibili 用户 ${userId} - 服务不可用`,
        description: `由于 Bilibili 对 Cloudflare Workers 的访问限制，此路由器暂时无法提供服务`,
        link: `https://space.bilibili.com/${userId}`,
        image: `https://www.bilibili.com/favicon.ico`
    };

    return {
        data: itemsToRss(errorItems, errorChannel, format),
        isError: true,
    };
}

// 保留时长格式化函数以备将来使用
function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '00:00';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
}