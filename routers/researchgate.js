import * as cheerio from "cheerio"
import { itemsToRss } from "../rss"
import { DateTime } from "luxon"

export default async function (params) {
    const { param, format, maxItems } = params;
    try {
        const profileId = param.id
        if (!profileId) {
            throw new Error("缺少 ResearchGate profile id")
        }

        // 使用带有重试和超时的fetch
        const fetchWithRetry = async (url, options, retries = 3, backoff = 1000) => {
            for (let i = 0; i < retries; i++) {
                try {
                    const controller = new AbortController()
                    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10秒超时
                    const response = await fetch(url, { ...options, signal: controller.signal })
                    clearTimeout(timeoutId)
                    return response
                } catch (error) {
                    if (i === retries - 1) throw error
                    await new Promise(resolve => setTimeout(resolve, backoff * (i + 1)))
                }
            }
        }

        const resp = await fetchWithRetry(`https://www.researchgate.net/profile/${profileId}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
            }
        }).catch(err => {
            console.error(`Fetch with retry failed for ${profileId}:`, err)
            return null // 返回null以便后续处理
        })

        if (!resp) {
            const items = [{
                title: `ResearchGate 访问失败 - ${profileId}`,
                link: `https://www.researchgate.net/profile/${profileId}`,
                description: `无法连接到 ResearchGate 服务器。可能是网络问题或服务器暂时不可用。`,
                author: "RSS Worker 诊断系统",
                guid: `fetch-error-${profileId}-${Date.now()}`,
                pubDate: new Date().toUTCString(),
            }]
            const channel = {
                title: `${profileId} - ResearchGate (访问受限)`,
                description: `ResearchGate 个人资料 ${profileId} - 由于网站访问限制无法获取数据`,
                link: `https://www.researchgate.net/profile/${profileId}`,
                image: "https://www.researchgate.net/favicon.ico"
            }

            return {
                data: itemsToRss(items, channel, format),
                isError: true,
            };
        }

        if (!resp.ok) {
            console.error(`ResearchGate fetch failed: ${resp.status} ${resp.statusText}`)

            // 创建一个详细的错误分析RSS响应
            let errorAnalysis = '';
            let suggestions = '';

            if (resp.status === 403) {
                errorAnalysis = `
                <h3>🚫 403 Forbidden - 访问被拒绝</h3>
                <p><strong>这是最常见的ResearchGate访问问题</strong></p>
                <p><strong>具体原因：</strong></p>
                <ul>
                    <li>🛡️ <strong>Cloudflare防护：</strong>ResearchGate使用Cloudflare的Bot Management</li>
                    <li>🌍 <strong>地理限制：</strong>某些地区的服务器IP被限制</li>
                    <li>🤖 <strong>反爬虫检测：</strong>自动检测到非浏览器访问</li>
                    <li>📊 <strong>频率限制：</strong>请求频率过高触发保护</li>
                </ul>`;

                suggestions = `
                <h3>💡 解决建议</h3>
                <p><strong>立即可用的方案：</strong></p>
                <ul>
                    <li>🌐 手动访问：<a href="https://www.researchgate.net/profile/${profileId}" target="_blank">查看原页面</a></li>
                    <li>📱 使用移动端：有时移动版本限制较少</li>
                    <li>🔍 Google Scholar搜索：<a href="https://scholar.google.com/scholar?q=${encodeURIComponent(profileId)}+site:researchgate.net" target="_blank">在Google Scholar中搜索</a></li>
                </ul>
                
                <p><strong>技术替代方案：</strong></p>
                <ul>
                    <li>📚 <strong>ORCID RSS：</strong> 如果研究者有ORCID ID</li>
                    <li>🎓 <strong>Google Scholar RSS：</strong> 使用第三方服务</li>
                    <li>� <strong>邮件通知：</strong> 设置ResearchGate邮件提醒</li>
                    <li>🔖 <strong>浏览器书签：</strong> 定期手动检查</li>
                </ul>`;
            } else if (resp.status === 404) {
                errorAnalysis = `
                <h3>❓ 404 Not Found - 用户不存在</h3>
                <p>指定的用户名可能不存在或已更改</p>`;
                suggestions = `
                <h3>🔍 检查建议</h3>
                <ul>
                    <li>✏️ 检查用户名拼写：<code>${profileId}</code></li>
                    <li>🔍 在ResearchGate搜索该研究者</li>
                    <li>📧 联系研究者获取正确的profile URL</li>
                </ul>`;
            } else if (resp.status === 429) {
                errorAnalysis = `
                <h3>⏰ 429 Too Many Requests - 请求过于频繁</h3>
                <p>触发了ResearchGate的频率限制</p>`;
                suggestions = `
                <h3>⏳ 解决方案</h3>
                <ul>
                    <li>等待一段时间后重试</li>
                    <li>降低RSS更新频率</li>
                    <li>使用手动访问作为临时方案</li>
                </ul>`;
            } else {
                errorAnalysis = `
                <h3>⚠️ HTTP ${resp.status} - ${resp.statusText}</h3>
                <p>遇到了意外的服务器响应</p>`;
                suggestions = `
                <h3>🔧 通用建议</h3>
                <ul>
                    <li>稍后重试</li>
                    <li>检查ResearchGate是否正常运行</li>
                    <li>手动访问确认页面状态</li>
                </ul>`;
            }

            const items = [{
                title: `ResearchGate HTTP ${resp.status} 错误 - ${profileId}`,
                link: `https://www.researchgate.net/profile/${profileId}`,
                description: `<![CDATA[
                ${errorAnalysis}
                ${suggestions}
                
                <hr>
                <p><strong>📊 技术详情：</strong></p>
                <ul>
                    <li>状态码：${resp.status}</li>
                    <li>状态信息：${resp.statusText}</li>
                    <li>时间：${new Date().toLocaleString()}</li>
                    <li>目标URL：https://www.researchgate.net/profile/${profileId}</li>
                </ul>
                
                <p><strong>🎯 下一步行动：</strong></p>
                <ol>
                    <li>点击上方链接手动访问页面</li>
                    <li>如果页面正常，说明是自动访问限制</li>
                    <li>考虑使用替代的学术资料RSS源</li>
                    <li>设置浏览器书签定期检查更新</li>
                </ol>
            ]]>`,
                author: "RSS Worker 诊断系统",
                guid: `http-error-${resp.status}-${profileId}-${Date.now()}`,
                pubDate: new Date().toUTCString(),
                enclosure: {
                    url: "https://www.researchgate.net/favicon.ico",
                    length: "0",
                    type: "image/x-icon"
                }
            }]

            const channel = {
                title: `${profileId} - ResearchGate (错误 ${resp.status})`,
                description: `ResearchGate 访问错误 - HTTP ${resp.status}: ${resp.statusText}`,
                link: `https://www.researchgate.net/profile/${profileId}`,
                image: "https://www.researchgate.net/favicon.ico"
            }

            return {
                data: itemsToRss(items, channel, format),
                isError: true,
            };
        }

        const html = await resp.text()
        const $ = cheerio.load(html)

        // 获取作者信息
        const authorName = $('h1[itemprop="name"]').text().trim() || profileId
        const affiliation = $('.nova-legacy-v-person-item__stack-item .nova-legacy-e-text').first().text().trim()

        const items = []

        // 解析每个出版物
        $('.nova-legacy-v-publication-item').each((i, el) => {
            const $item = $(el)

            // 提取标题和链接
            const titleElement = $item.find('.nova-legacy-v-publication-item__title a')
            const title = titleElement.text().trim()
            const link = titleElement.attr('href') || ""

            if (!title || !link) return // 跳过无效条目

            // 提取出版物类型
            const type = $item.find('.nova-legacy-e-badge').text().trim() || "Publication"

            // 提取日期
            const dateText = $item.find('.nova-legacy-v-publication-item__meta-data-item span').text().trim()
            let pubDate = ""
            if (dateText) {
                try {
                    // 处理各种日期格式：Sep 2025, September 2025, 2025等
                    const dateMatch = dateText.match(/(\w+)\s+(\d{4})/)
                    if (dateMatch) {
                        const [, month, year] = dateMatch
                        const date = DateTime.fromObject({
                            year: parseInt(year),
                            month: DateTime.fromFormat(month, 'MMM').month || DateTime.fromFormat(month, 'MMMM').month || 1
                        })
                        if (date.isValid) {
                            pubDate = date.toRFC2822()
                        }
                    } else if (/^\d{4}$/.test(dateText)) {
                        // 只有年份的情况
                        const date = DateTime.fromObject({ year: parseInt(dateText), month: 1 })
                        if (date.isValid) {
                            pubDate = date.toRFC2822()
                        }
                    }
                } catch (e) {
                    console.error("Date parsing error:", e)
                }
            }

            // 提取作者列表
            const authors = []
            $item.find('.nova-legacy-v-person-inline-item__fullname').each((j, authorEl) => {
                const authorName = $(authorEl).text().trim()
                if (authorName && authorName !== '[...]') {
                    authors.push(authorName)
                }
            })

            // 生成描述
            const description = `
            <![CDATA[
                <p><strong>Type:</strong> ${type}</p>
                <p><strong>Authors:</strong> ${authors.join(', ')}</p>
                <p><strong>Publication Date:</strong> ${dateText || 'Not specified'}</p>
                <p><a href="${link}" target="_blank">View on ResearchGate</a></p>
            ]]>
        `

            items.push({
                title: title,
                link: link.startsWith('http') ? link : `https://www.researchgate.net${link}`,
                description: description,
                author: authors.join(', ') || authorName,
                guid: link,
                pubDate: pubDate || new Date().toUTCString(),
                enclosure: {
                    url: "https://www.researchgate.net/favicon.ico",
                    length: "0",
                    type: "image/x-icon"
                }
            })
        })

        let finalItems = items;
        if (finalItems.length > maxItems) {
            finalItems = finalItems.slice(0, maxItems);
        }

        // 构建频道信息
        const channel = {
            title: `${authorName} - ResearchGate Publications`,
            description: `Research publications by ${authorName}${affiliation ? ` (${affiliation})` : ''} on ResearchGate`,
            link: `https://www.researchgate.net/profile/${profileId}`,
            image: "https://www.researchgate.net/favicon.ico"
        }

        return {
            data: itemsToRss(finalItems, channel, format),
            isError: finalItems.length === 0, // 如果没有抓取到任何条目，也视为一种错误状态
        };
    } catch (error) {
        console.error(`ResearchGate processor error: ${error.message}`, error)
        const items = [{
            title: 'ResearchGate Processor Error',
            link: `https://www.researchgate.net`,
            description: `Error processing ResearchGate feed: ${error.message}`,
            author: "RSS Worker",
            guid: `rg-error-${Date.now()}`,
            pubDate: new Date().toUTCString(),
        }]
        const channel = {
            title: 'ResearchGate Processor Error',
            description: 'An error occurred while processing the ResearchGate feed.',
            link: `https://www.researchgate.net`,
            image: "https://www.researchgate.net/favicon.ico"
        }
        return {
            data: itemsToRss(items, channel, format),
            isError: true,
        };
    }
}