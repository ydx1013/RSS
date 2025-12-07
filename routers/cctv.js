import * as cheerio from "cheerio"
import { itemsToRss } from "../rss.js"
import { DateTime } from "luxon"

export default async function (params) {
    const { param: program = 'xwlb', format, maxItems } = params;

    // 支持不同的CCTV节目，默认为新闻联播
    const programUrls = {
        'xwlb': 'http://tv.cctv.com/lm/xwlb/',  // 新闻联播
    }
    
    const url = programUrls[program] || programUrls['xwlb']
    
    try {
        const resp = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Cache-Control': 'no-cache'
            }
        })
        
        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`)
        }
        
        const html = await resp.text()
        const $ = cheerio.load(html)
        
        // 优先从页面标题获取日期
        let episodeDate = ''
        const dateFromTitle = $('.rilititle p').first().text().trim() // e.g., "2025-09-22"
        if (dateFromTitle && /^\d{4}-\d{2}-\d{2}$/.test(dateFromTitle)) {
            episodeDate = dateFromTitle.replace(/-/g, ''); // 转换为 YYYYMMDD
        }

        // 存储所有新闻条目
        let allNews = []

        // 解析新闻列表
        $('.rililist.newsList li').each((i, el) => {
            const $el = $(el)
            
            // 提取基本信息
            const linkElement = $el.find('a').first()
            const link = linkElement.attr('href') || ''
            const fullTitle = linkElement.attr('title') || linkElement.text().trim() || ''
            
            // 处理标题：移除[视频]前缀和"完整版"标识
            let title = fullTitle
                .replace(/^\[视频\]/, '')  // 移除[视频]前缀
                .replace(/^完整版/, '')    // 秮除完整版前缀
                .trim()
            
            // 如果没有标题，跳过此条目
            if (!title || !link) return
            
            // 提取图片
            const imgElement = $el.find('img').first()
            const imageUrl = imgElement.attr('src') || ''
            const fullImageUrl = imageUrl.startsWith('//') ? `https:${imageUrl}` : imageUrl
            
            // 提取视频时长 - 从 .image div 中的 span 获取
            const durationElement = $el.find('.image span')
            const duration = durationElement.text().trim() || '未知时长'
            
            // 提取类型标识
            const typeElement = $el.find('i[class^="sql"]')
            const newsType = typeElement.text().trim() || '完整版'
            
            // 如果未能从标题获取日期，则从链接中提取作为备用
            if (!episodeDate) {
                const dateMatch = link.match(/(\d{8})/)
                if (dateMatch) {
                    episodeDate = dateMatch[1] // 格式：YYYYMMDD
                }
            }
            
            // 判断是否为完整版（通常第一个是完整版，且包含时间信息）
            const isFullEpisode = (i === 0) || title.includes('新闻联播') && title.match(/\d{8}/) && title.includes('19:00')
            
            allNews.push({
                title,
                link,
                image: fullImageUrl,
                duration,
                isFullEpisode,
                newsType,
                index: i
            })
        })

        // 如果没有找到内容，返回错误
        if (allNews.length === 0) {
            throw new Error('未找到新闻内容')
        }

        // 限制数量
        if (allNews.length > maxItems) {
            allNews = allNews.slice(0, maxItems);
        }

        // 分离完整版和子新闻
        const fullEpisode = allNews.find(news => news.isFullEpisode) || allNews[0]
        const subNews = allNews.filter(news => !news.isFullEpisode && news !== fullEpisode)

        console.log(`找到 ${allNews.length} 条新闻，完整版: ${fullEpisode?.title}, 子新闻: ${subNews.length} 条`)

        // 格式化日期
        let pubDate = new Date().toUTCString()
        let displayDate = new Date().toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: '2-digit', 
            day: '2-digit'
        }).replace(/\//g, '年').replace(/(\d{2})年/, '$1年').replace(/(\d{2})$/, '$1日').replace(/(\d{2})年/, '$1月')
        
        if (episodeDate) {
            try {
                const year = episodeDate.substring(0, 4)
                const month = episodeDate.substring(4, 6)
                const day = episodeDate.substring(6, 8)
                
                displayDate = `${year}年${month}月${day}日`
                
                const date = DateTime.fromObject({
                    year: parseInt(year),
                    month: parseInt(month),
                    day: parseInt(day),
                    hour: 19,  // 新闻联播通常19:00播出
                    minute: 0
                }, { zone: 'Asia/Shanghai' })
                
                pubDate = date.toRFC2822()
            } catch (e) {
                console.error('日期解析错误:', e)
            }
        }

        // 构建综合文章内容
        let articleContent = ''
        
        // 添加完整版信息
        if (fullEpisode) {
            articleContent += `
                <div style="border: 2px solid #e74c3c; border-radius: 8px; padding: 15px; margin-bottom: 20px; background-color: #fff5f5;">
                    <h3 style="color: #e74c3c; margin: 0 0 10px 0;">📺 完整版节目</h3>
                    ${fullEpisode.image ? `<img src="${fullEpisode.image}" style="max-width: 100%; height: auto; margin-bottom: 10px; border-radius: 4px;" alt="${fullEpisode.title}" />` : ''}
                    <p style="margin: 5px 0;"><strong>标题：</strong>${fullEpisode.title}</p>
                    <p style="margin: 5px 0;"><strong>时长：</strong>${fullEpisode.duration}</p>
                    <p style="margin: 5px 0;"><a href="${fullEpisode.link}" target="_blank" style="color: #e74c3c; text-decoration: none; font-weight: bold;">🎬 观看完整版</a></p>
                </div>
            `
        }
        
        // 添加子新闻列表
        if (subNews.length > 0) {
            articleContent += `
                <div style="border: 2px solid #3498db; border-radius: 8px; padding: 15px; background-color: #f8f9fa;">
                    <h3 style="color: #3498db; margin: 0 0 15px 0;">📋 今日新闻内容</h3>
                    <ul style="list-style: none; padding: 0; margin: 0;">
            `
            
            subNews.forEach((news, index) => {
                articleContent += `
                    <li style="margin-bottom: 15px; padding: 10px; background-color: white; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                        <div style="display: flex; align-items: flex-start; gap: 10px;">
                            ${news.image ? `<img src="${news.image}" style="width: 80px; height: 60px; object-fit: cover; border-radius: 4px; flex-shrink: 0;" alt="" />` : ''}
                            <div style="flex: 1;">
                                <h4 style="margin: 0 0 5px 0; color: #2c3e50; font-size: 14px; line-height: 1.4;">
                                    <span style="background-color: #3498db; color: white; padding: 2px 6px; border-radius: 3px; font-size: 12px; margin-right: 8px;">${index + 1}</span>
                                    ${news.title}
                                </h4>
                                <p style="margin: 5px 0; color: #7f8c8d; font-size: 12px;">
                                    ⏱️ ${news.duration} | 
                                    <a href="${news.link}" target="_blank" style="color: #3498db; text-decoration: none;">🔗 观看视频</a>
                                </p>
                            </div>
                        </div>
                    </li>
                `
            })
            
            articleContent += `
                    </ul>
                    <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid #ecf0f1; color: #7f8c8d; font-size: 12px;">
                        📊 本期节目共包含 <strong>${subNews.length}</strong> 条新闻
                    </div>
                </div>
            `
        } else {
            // 如果没有子新闻，显示所有新闻（除了完整版）
            const otherNews = allNews.filter(news => news !== fullEpisode)
            if (otherNews.length > 0) {
                articleContent += `
                    <div style="border: 2px solid #3498db; border-radius: 8px; padding: 15px; background-color: #f8f9fa;">
                        <h3 style="color: #3498db; margin: 0 0 15px 0;">📋 今日新闻内容</h3>
                        <ul style="list-style: none; padding: 0; margin: 0;">
                `
                
                otherNews.forEach((news, index) => {
                    articleContent += `
                        <li style="margin-bottom: 15px; padding: 10px; background-color: white; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                            <div style="display: flex; align-items: flex-start; gap: 10px;">
                                ${news.image ? `<img src="${news.image}" style="width: 80px; height: 60px; object-fit: cover; border-radius: 4px; flex-shrink: 0;" alt="" />` : ''}
                                <div style="flex: 1;">
                                    <h4 style="margin: 0 0 5px 0; color: #2c3e50; font-size: 14px; line-height: 1.4;">
                                        <span style="background-color: #3498db; color: white; padding: 2px 6px; border-radius: 3px; font-size: 12px; margin-right: 8px;">${index + 1}</span>
                                        ${news.title}
                                    </h4>
                                    <p style="margin: 5px 0; color: #7f8c8d; font-size: 12px;">
                                        ⏱️ ${news.duration} | 
                                        <a href="${news.link}" target="_blank" style="color: #3498db; text-decoration: none;">🔗 观看视频</a>
                                    </p>
                                </div>
                            </div>
                        </li>
                    `
                })
                
                articleContent += `
                        </ul>
                        <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid #ecf0f1; color: #7f8c8d; font-size: 12px;">
                            📊 本期节目共包含 <strong>${otherNews.length}</strong> 条新闻
                        </div>
                    </div>
                `
            }
        }
        
        // 添加页脚信息
        articleContent += `
            <div style="margin-top: 20px; padding: 10px; background-color: #f8f9fa; border-radius: 4px; text-align: center; color: #7f8c8d; font-size: 12px;">
                <p>📺 中央电视台新闻联播 | 📅 ${displayDate} | 🔗 <a href="${url}" target="_blank" style="color: #3498db;">访问官网</a></p>
            </div>
        `

        // 构建RSS条目 - 只生成一篇文章
        const programNames = {
            'xwlb': '新闻联播',
            'xwzk': '新闻直播间', 
            'hjzs': '焦点访谈'
        }
        
        const channelTitle = programNames[program] || '新闻联播'
        const mainTitle = `${channelTitle} ${displayDate} (共${allNews.length}条新闻)`
        
        const items = [{
            title: mainTitle,
            link: fullEpisode ? fullEpisode.link : url,
            description: `<![CDATA[${articleContent}]]>`,
            author: channelTitle,
            guid: `${url}#${episodeDate || Date.now()}`,
            pubDate: pubDate,
            enclosure: fullEpisode && fullEpisode.image ? {
                url: fullEpisode.image,
                length: "0",
                type: "image/jpeg"
            } : {
                url: "https://p1.img.cctvpic.com/photoworkspace/contentimg/2021/01/20/2021012009593510180.png",
                length: "0", 
                type: "image/png"
            }
        }]

        const channel = {
            title: `${channelTitle} - 每日节目`,
            description: `${channelTitle} - 每日新闻内容汇总，包含完整版节目和所有子新闻`,
            link: url,
            image: "https://p1.img.cctvpic.com/photoworkspace/contentimg/2021/01/20/2021012009593510180.png"
        }

        return {
            data: itemsToRss(items, channel, format),
            isError: false,
        };
        
    } catch (error) {
        console.error('CCTV RSS 生成错误:', error)
        
        // 返回错误信息的RSS
        const errorItems = [{
            title: 'CCTV RSS 访问错误',
            link: url,
            description: `<![CDATA[
                <h3>访问 CCTV 网站时发生错误</h3>
                <p><strong>错误信息：</strong>${error.message}</p>
                <p><strong>可能原因：</strong></p>
                <ul>
                    <li>网络连接问题</li>
                    <li>CCTV网站临时不可访问</li>
                    <li>网站结构发生变化</li>
                </ul>
                <p><strong>建议：</strong></p>
                <ul>
                    <li>稍后重试</li>
                    <li>直接访问 <a href="${url}" target="_blank">CCTV官网</a></li>
                    <li>检查网络连接</li>
                </ul>
            ]]>`,
            author: 'System',
            guid: `error-${Date.now()}`,
            pubDate: new Date().toUTCString(),
            enclosure: {
                url: "https://p1.img.cctvpic.com/photoworkspace/contentimg/2021/01/20/2021012009593510180.png",
                length: "0",
                type: "image/png"
            }
        }]
        
        const channel = {
            title: 'CCTV RSS - 错误',
            description: 'CCTV RSS 访问出现错误',
            link: url,
            image: "https://p1.img.cctvpic.com/photoworkspace/contentimg/2021/01/20/2021012009593510180.png"
        }
        
        return {
            data: itemsToRss(errorItems, channel, format),
            isError: true,
        };
    }
}