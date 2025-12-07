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

function generateRss(items, channel) {
    let rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${channel.title || "无"}</title>
  <link>${channel.link || "无"}</link>
  <description>${channel.description || "无"}</description>
  <atom:link href="${channel.link}" rel="self" type="application/rss+xml" />
  <image>
    <url>${channel.image}</url>
    <title>${channel.title || "无"}</title>
    <link>${channel.link || "无"}</link>
  </image>`;

    for (let i = 0; i < items.length; i++) {
        let item = items[i];
        rss += `
    <item>
      <title>${item.title || "无"}</title>
      <link>${item.link || "无"}</link>
      <description>${item.description || "无"}</description>
      <author>${item.author || "无"}</author>
      <enclosure url="${item.enclosure?.url || ""}" length="${item.enclosure?.length || "0"}" type="${item.enclosure?.type || ""}" />
      <guid isPermaLink="false">${item.guid || item.link}</guid>
      <pubDate>${item.pubDate || new Date().toUTCString()}</pubDate>
    </item>`;
    }

    rss += `
</channel>
</rss>`;

    return rss;
}

function generateAtom(items, channel) {
    const updated = items.length > 0 ? items[0].pubDate : new Date().toISOString();
    let atom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${channel.title || "无"}</title>
  <link href="${channel.link}" />
  <link href="${channel.link}" rel="self" />
  <id>${channel.link}</id>
  <updated>${updated}</updated>
  <subtitle>${channel.description || "无"}</subtitle>
  <logo>${channel.image}</logo>
  <icon>${channel.image}</icon>`;

    for (const item of items) {
        atom += `
  <entry>
    <title>${item.title || "无"}</title>
    <link href="${item.link || ""}" />
    <id>${item.guid || item.link}</id>
    <updated>${item.pubDate || new Date().toISOString()}</updated>
    <summary>${(item.description || "").replace(/<!\[CDATA\[(.*?)\]\]>/s, '$1').substring(0, 200)}</summary>
    <content type="html"><![CDATA[${item.description || ""}]]></content>
    <author>
      <name>${item.author || "无"}</name>
    </author>
  </entry>`;
    }

    atom += `
</feed>`;
    return atom;
}

function generateJsonFeed(items, channel) {
    const jsonFeed = {
        version: "https://jsonfeed.org/version/1.1",
        title: channel.title || "无",
        home_page_url: channel.link || "",
        feed_url: channel.link,
        description: channel.description || "无",
        icon: channel.image,
        favicon: channel.image,
        items: items.map(item => ({
            id: item.guid || item.link,
            url: item.link || "",
            title: item.title || "无",
            content_html: item.description || "",
            summary: (item.description || "").replace(/<!\[CDATA\[(.*?)\]\]>/s, '$1').substring(0, 200),
            date_published: new Date(item.pubDate || 0).toISOString(),
            author: {
                name: item.author || "无"
            },
            attachments: item.enclosure ? [{
                url: item.enclosure.url,
                mime_type: item.enclosure.type,
                size_in_bytes: parseInt(item.enclosure.length) || 0
            }] : []
        }))
    };
    return JSON.stringify(jsonFeed, null, 2);
}

