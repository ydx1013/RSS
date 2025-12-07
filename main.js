import dlsite from "./routers/dlsite.js"
import github from "./routers/github.js"
import kemono from "./routers/kemono.js"
import cospuri from "./routers/cospuri.js"
import fellatiojapan from "./routers/fellatiojapan.js"
import javbus from "./routers/javbus.js"
import telegram from "./routers/telegram.js"
import researchgate from "./routers/researchgate.js"
import cctv from "./routers/cctv.js"
import helixlife from "./routers/helixlife.js"
import hhkaobo from "./routers/hhkaobo.js"
import gushiyaowan from "./routers/gushiyaowan.js"
import _10jqka from "./routers/10jqka.js"
import iqnew from "./routers/iqnew.js"
import bilibili from "./routers/bilibili.js"
import tracker from "./routers/tracker.js"
import { cacheConfig } from "./config.js"

const funcs = { iqnew, dlsite, github, kemono, cospuri, fellatiojapan, javbus, telegram, researchgate, cctv, helixlife, hhkaobo, gushiyaowan, bilibili, tracker, "10jqka": _10jqka }

export default {
    async fetch(request, env) {

        console.log("UA:", request.headers.get("User-Agent") || "无UA")

        const url = new URL(request.url)

        const paramName = Array.from(url.searchParams.keys())[0]
        const paramValue = url.searchParams.get(paramName)
        const format = url.searchParams.get("format") || 'rss'; // 新增：获取格式参数，默认为rss
        const forceRefresh = url.searchParams.has('refresh'); // 检查是否强制刷新

        if (!paramName || !paramValue) return new Response("缺少参数", { status: 400 })

        // 生成缓存键 - 如果强制刷新，添加时间戳使缓存键唯一
        const cacheKeyUrl = forceRefresh ? `${url.toString()}&t=${Date.now()}` : url.toString();
        const cacheKey = new Request(cacheKeyUrl)
        const cache = caches.default

        // 尝试从缓存中获取响应
        let response = await cache.match(cacheKey)
        if (response) {
            console.log("从缓存返回响应")
            // 添加缓存命中标识
            const newHeaders = new Headers(response.headers)
            newHeaders.set("X-Cache-Status", "HIT")
            newHeaders.set("X-Cache-Date", response.headers.get("Date") || new Date().toUTCString())
            
            return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: newHeaders
            })
        }

        if (paramName === "raw") {
            const resp = await fetch(paramValue, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                    "Accept-Language": "zh-CN,zh;q=0.9",
                    "Referer": paramValue,
                    "Origin": paramValue,
                }
            })
            const html = await resp.text()
            response = new Response(html, { 
                headers: { 
                    "content-type": "text/plain; charset=utf-8",
                    "Cache-Control": "public, max-age=30000", // 8小时缓存
                    "Date": new Date().toUTCString(),
                    "X-Cache-Status": "MISS"
                } 
            })
            // 存储到缓存
            await cache.put(cacheKey, response.clone())
            return response
        }

        if (paramName === "proxy") {
            const resp = await fetch(paramValue, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
                    "Accept": "*/*",
                    "Accept-Language": "zh-CN,zh;q=0.9",
                    "Referer": paramValue,
                    "Origin": paramValue,
                }
            })
            
            // 读取内容到ArrayBuffer，这样可以多次使用
            const content = await resp.arrayBuffer()
            
            response = new Response(content, {
                headers: {
                    "content-type": resp.headers.get("content-type") || "application/octet-stream",
                    "Cache-Control": "public, max-age=3600", // 代理内容缓存1小时
                    "Date": new Date().toUTCString(),
                    "X-Cache-Status": "MISS"
                }
            })
            // 存储到缓存
            await cache.put(cacheKey, response.clone())
            return response
        }



        const func = funcs[paramName]  // 动态调用
        if (typeof func !== "function") {
            return new Response("未知参数：" + paramName, { status: 400 })
        }

        // 从配置中获取路由的特定配置，或使用默认配置
        const routeConfig = cacheConfig.routes[paramName] || cacheConfig.default;

        // 将所有需要的参数打包成一个对象
        const params = {
            param: paramValue,
            workerUrl: new URL(request.url).origin,
            format: format,
            maxItems: routeConfig.maxItems || cacheConfig.default.maxItems, // 优先用路由配置，否则用全局默认
        };

        const result = await func(params);

        // 从配置中获取缓存时间
        const cacheTime = result.isError ? routeConfig.error : routeConfig.success;
        const rss = result.data;


        const contentTypes = {
            rss: "application/rss+xml; charset=utf-8",
            atom: "application/atom+xml; charset=utf-8",
            json: "application/json; charset=utf-8"
        }

        response = new Response(rss, {
            headers: { 
                "content-type": contentTypes[format] || contentTypes.rss,
                "Cache-Control": `public, max-age=${cacheTime}`, // 使用从配置中获取的缓存时间
                "X-Cache-Status": "MISS", // 标识这是新生成的内容
                "Date": new Date().toUTCString(), // 添加生成时间
                "X-Generated-At": new Date().toISOString() // 生成时间戳
            }
        })

        // 存储到缓存
        await cache.put(cacheKey, response.clone())
        
        return response

    }
}




