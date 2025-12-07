import { DateTime } from 'luxon'
import { itemsToRss } from '../rss.js'

export default async function (params) {
    const { param: REP, format, maxItems } = params;
    const apiUrl = `https://api.github.com/repos/${REP}/releases`;
    const url = `https://github.com/${REP}/releases`;
    try {
        console.log("github:", REP);
        const resp = await fetch(apiUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
                "Accept": "application/vnd.github.v3+json",
            }
        });
        if (!resp.ok) {
            throw new Error(`GitHub API 请求失败: ${resp.status}`);
        }
        const releases = await resp.json();

        let items = releases.map(r => {
            const assetsHtml = (r.assets || []).map(a => {
                return `<a href="${a.browser_download_url}">${a.name}</a> (${(a.size / 1024 / 1024).toFixed(2)} MB, 下载 ${a.download_count})`;
            }).join('<br/>');

            const content = `<![CDATA[
${r.body || ''}
<br/><br/>
${assetsHtml}
]]>`;

            const pubDate = r.published_at
                ? DateTime.fromISO(r.published_at, { zone: 'utc' }).toRFC2822()
                : '';

            return {
                title: r.name || r.tag_name,
                link: r.html_url,
                description: content,
                author: r.author?.login || 'unknown',
                guid: r.html_url,
                pubDate,
                enclosure: {
                    url: "https://github.githubassets.com/assets/GitHub-Mark-ea2971cee799.png",
                    length: "0",
                    type: "image/png"
                }
            };
        });

        if (items.length > maxItems) {
            items = items.slice(0, maxItems);
        }

        const channel = {
            title: `${REP} - Github Releases`,
            description: `Repository releases for ${REP}`,
            link: url,
            image: "https://github.githubassets.com/assets/GitHub-Mark-ea2971cee799.png"
        };

        return {
            data: itemsToRss(items, channel, format),
            isError: false,
        };
    } catch (error) {
        console.error('GitHub RSS 生成错误:', error);
        const errorItems = [{
            title: 'GitHub RSS 访问错误',
            link: url,
            description: `<![CDATA[<h3>访问 GitHub API 时发生错误</h3><p><strong>仓库：</strong>${REP}</p><p><strong>错误信息：</strong>${error.message}</p>]]>`,
            author: 'System',
            guid: `error-github-${REP}-${Date.now()}`,
            pubDate: new Date().toUTCString(),
        }];
        const channel = {
            title: `GitHub RSS - 错误 (${REP})`,
            description: 'GitHub RSS 访问出现错误',
            link: url,
            image: "https://github.githubassets.com/assets/GitHub-Mark-ea2971cee799.png"
        };
        return {
            data: itemsToRss(errorItems, channel, format),
            isError: true,
        };
    }
}
