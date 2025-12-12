// XML转义函数
function escapeXml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

export function itemsToRss(items, channel, format = 'atom') {
    switch (format) {
        case 'atom':
            return generateAtom(items, channel);
        case 'json':
            return generateJsonFeed(items, channel);
        case 'rss':
            return generateRss(items, channel);
    }
}


function sanitizeCdata(text) {
    if (!text) return '';
    return text.replace(/]]>/g, ']]]]><![CDATA[>');
}

function generateRss(items, channel) {
    const itemsXml = items.map(item => {
        // title和link的文本内容需要转义，因为它们是XML文本节点
        const title = item.title ? escapeXml(item.title) : 'Untitled';
        const link = item.link || '#';
        const description = item.description ? `<![CDATA[${sanitizeCdata(item.description)}]]>` : '';
        const pubDate = item.pubDate ? new Date(item.pubDate).toUTCString() : new Date().toUTCString();
        const guid = item.guid || item.link || '#';
        const author = item.author ? `<author>${escapeXml(item.author)}</author>` : '';

        // 只在有完整enclosure信息时才添加enclosure标签
        const enclosure = item.enclosure?.url ?
            `<enclosure url="${escapeXml(item.enclosure.url)}" length="${item.enclosure.length || 0}" type="${escapeXml(item.enclosure.type || 'application/octet-stream')}" />`
            : '';

        return `
        <item>
            <title>${title}</title>
            <link>${link}</link>
            ${description ? `<description>${description}</description>` : ''}
            <pubDate>${pubDate}</pubDate>
            <guid isPermaLink="${item.guid_isPermaLink !== false && item.link}">${guid}</guid>
            ${author}
            ${enclosure}
        </item>`;
    }).join("\n");

    const channelTitle = channel.title ? escapeXml(channel.title) : 'RSS Feed';
    const channelLink = channel.link || '#';
    const channelDesc = channel.description ? escapeXml(channel.description) : '';

    const imageXml = channel.image?.url ? `
        <image>
            <url>${channel.image.url}</url>
            <title>${channel.image.title ? escapeXml(channel.image.title) : escapeXml(channel.title || 'Image')}</title>
            <link>${channel.image.link || channel.link || '#'}</link>
        </image>` : '';

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
    <channel>
        <title>${channelTitle}</title>
        <link>${channelLink}</link>
        <description>${channelDesc}</description>
        <language>${channel.language || "zh-CN"}</language>
        <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
        ${imageXml}
        ${itemsXml}
    </channel>
</rss>`;
}

function generateAtom(items, channel) {
    const entriesXml = items.map(item => {
        const title = item.title ? escapeXml(item.title) : 'Untitled';
        const link = item.link || '#';
        const id = item.guid || item.link || `urn:uuid:${Date.now()}-${Math.random()}`;
        const published = item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString();
        const updated = item.updated ? new Date(item.updated).toISOString() : published;
        const author = item.author ? `<author><name>${escapeXml(item.author)}</name></author>` : '';
        const summary = item.description ? `<summary type="html"><![CDATA[${sanitizeCdata(item.description).substring(0, 200)}]]></summary>` : '';
        const content = item.description ? `<content type="html"><![CDATA[${sanitizeCdata(item.description)}]]></content>` : '';

        return `
  <entry>
    <title>${title}</title>
    <link href="${link}" />
    <id>${id}</id>
    <published>${published}</published>
    <updated>${updated}</updated>
    ${summary}
    ${content}
    ${author}
  </entry>`;
    }).join("");

    const feedTitle = channel.title ? escapeXml(channel.title) : 'Atom Feed';
    const feedLink = channel.link || '#';
    const feedId = channel.id || channel.link || `urn:uuid:${Date.now()}`;
    const feedSubtitle = channel.description ? escapeXml(channel.description) : '';
    const feedUpdated = items.length > 0 && items[0].pubDate ? new Date(items[0].pubDate).toISOString() : new Date().toISOString();
    const feedIcon = channel.image ? `<icon>${channel.image}</icon>` : '';
    const feedLogo = channel.image ? `<logo>${channel.image}</logo>` : '';

    return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${feedTitle}</title>
  <link href="${feedLink}" />
  <link href="${feedLink}" rel="self" />
  <id>${feedId}</id>
  <updated>${feedUpdated}</updated>
  ${feedSubtitle ? `<subtitle>${feedSubtitle}</subtitle>` : ''}
  ${feedLogo}
  ${feedIcon}${entriesXml}
</feed>`;
}

function generateJsonFeed(items, channel) {
    const jsonFeed = {
        version: "https://jsonfeed.org/version/1.1",
        title: channel.title || "JSON Feed",
        home_page_url: channel.link || "",
        feed_url: channel.link,
        description: channel.description || "",
        items: items.map(item => {
            const feedItem = {
                id: item.guid || item.link,
                url: item.link || "",
                title: item.title || "Untitled",
                content_html: item.description || "",
                date_published: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString()
            };

            if (item.author) {
                feedItem.author = { name: item.author };
            }

            if (channel.image) {
                feedItem.image = channel.image;
            }

            // 添加summary（从description生成，去除CDATA）
            if (item.description) {
                const plainText = item.description.replace(/<!\[CDATA\[(.*?)\]\]>/s, '$1').replace(/<[^>]*>/g, '');
                feedItem.summary = plainText.substring(0, 200);
            }

            return feedItem;
        })
    };

    // 只在有值时添加可选字段
    if (channel.image) {
        jsonFeed.icon = channel.image;
        jsonFeed.favicon = channel.image;
    }

    return JSON.stringify(jsonFeed, null, 2);
}

