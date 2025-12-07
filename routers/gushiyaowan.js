import { itemsToRss } from "../rss.js"

export default async function (params) {
    const { format, maxItems } = params;
    try {
        const apiUrl = "http://f.gushiyaowan.cn/v1/portfolio/stockBondYRDiff/list/official?indexCode=000300&bondCode=CN10YR&month=12&startDate=&endDate="
        const avgStdApiUrl = "http://f.gushiyaowan.cn/v1/portfolio/stockBondYRDiff/avgStd/list/official?indexCode=000300&bondCode=CN10YR&month=12&startDate=&endDate="
        
        const requestOptions = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
            }
        }
        
        const [response, avgStdResponse] = await Promise.all([
            fetch(apiUrl, requestOptions),
            fetch(avgStdApiUrl, requestOptions)
        ])
        
        const data = await response.json()
        const avgStdData = await avgStdResponse.json()
        
        let mainDataList = []
        if (data && data.code === "1" && data.data && Array.isArray(data.data.list)) {
            mainDataList = data.data.list
        } else {
            throw new Error("API响应错误")
        }
        
        let avgStdList = []
        if (avgStdData && avgStdData.code === "1" && avgStdData.data && Array.isArray(avgStdData.data.list)) {
            avgStdList = avgStdData.data.list
        }
        
        const sortedData = mainDataList.sort((a, b) => b.date - a.date)
        const recentData = sortedData.slice(0, maxItems)
        
        const items = recentData.map(item => {
            const date = new Date(item.date)
            const dateStr = date.toISOString().split('T')[0]
            
            const statsItem = avgStdList.find(stat => stat.date === item.date)
            
            const bondYR = (item.bondYR || 0).toFixed(3)
            const indexValue = (item.indexValue || 0).toFixed(2)
            const pe = (item.pe || 0).toFixed(2)
            const pePercentile = (item.pePercentile || 0).toFixed(2)
            const diff = (item.diff || 0).toFixed(2)
            const percentile = (item.percentile || 0).toFixed(2)
            
            const diffAvg = statsItem ? (statsItem.diffAvg || 0).toFixed(2) : '暂无'
            let supportLevel = '暂无'
            let resistanceLevel = '暂无'
            if (statsItem) {
                supportLevel = (statsItem.diffAvg - statsItem.diffStd).toFixed(2)
                resistanceLevel = (statsItem.diffAvg + statsItem.diffStd).toFixed(2)
            }
            
            const title = "📅 " + dateStr + " 股债收益差每日数据更新"
            
            // 添加价值判断逻辑
            const getBondYRAnalysis = (bondYR) => {
                const rate = parseFloat(bondYR)
                if (rate < 1.5) return "极低水平，资金避险情绪浓厚"
                if (rate < 2.0) return "偏低水平，流动性相对宽松"
                if (rate < 2.5) return "正常水平，货币政策中性"
                if (rate < 3.0) return "偏高水平，加息周期可能"
                return "高水平，紧缩政策预期"
            }
            
            const getPEAnalysis = (pePercentile) => {
                const p = parseFloat(pePercentile)
                if (p >= 90) return "历史高位，估值极度昂贵，风险很高"
                if (p >= 80) return "偏高水平，估值较贵，需谨慎"
                if (p >= 60) return "中高水平，估值合理偏贵"
                if (p >= 40) return "适中水平，估值相对合理"
                if (p >= 20) return "偏低水平，具备一定价值"
                return "历史低位，估值便宜，机会较好"
            }
            
            const getDiffAnalysis = (diff, diffAvg, percentile) => {
                const d = parseFloat(diff)
                const avg = parseFloat(diffAvg)
                const p = parseFloat(percentile)
                
                let positionDesc = ""
                if (d > avg + 0.5) positionDesc = "明显高于均值，股票相对债券有吸引力"
                else if (d > avg) positionDesc = "略高于均值，股票性价比尚可"
                else if (d < avg - 0.5) positionDesc = "明显低于均值，股票相对债券缺乏吸引力"
                else if (d < avg) positionDesc = "略低于均值，股票性价比一般"
                else positionDesc = "接近均值水平"
                
                let percentileDesc = ""
                if (p >= 80) percentileDesc = "百分位偏高，建议观望"
                else if (p >= 60) percentileDesc = "百分位中等偏上，适度配置"
                else if (p >= 40) percentileDesc = "百分位适中，可正常配置"
                else if (p >= 20) percentileDesc = "百分位偏低，可积极配置"
                else percentileDesc = "百分位很低，值得重点关注"
                
                return positionDesc + "；" + percentileDesc
            }
            
            const description = "<![CDATA[📊 数据日期: " + dateStr + "<br><br>💰 十年期国债收益率: " + bondYR + "%<br>📈 沪深300指数: " + indexValue + "<br>🟢 PE估值: " + pe + " (百分位: " + pePercentile + "%)<br>📊 股债收益差: " + diff + "% (百分位: " + percentile + "%)<br><br>📋 股债收益差的布林通道:<br>📊 均值: " + diffAvg + "%<br>🛡️ 支撑位: " + supportLevel + "%<br>⚡ 压力位: " + resistanceLevel + "%<br><br>📖 数据解读:<br>🏛️ <strong>国债收益率</strong>: " + getBondYRAnalysis(bondYR) + "<br>📊 <strong>PE估值</strong>: " + getPEAnalysis(pePercentile) + "<br>⚖️ <strong>股债收益差</strong>: " + getDiffAnalysis(diff, diffAvg, percentile) + "<br><br>💡 投资提示:<br>• 股债收益差 = 1/PE - 十年期国债收益率<br>• 百分位越高表示越贵，越低表示越便宜<br>• 当股债收益差高于均值+1标准差时，股票相对便宜<br>• 当股债收益差低于均值-1标准差时，股票相对昂贵<br>• 建议结合其他指标综合判断，理性投资]]>"
            
            return {
                title: title,
                link: "http://gushiyaowan.com/#/portfolio/stockBondYRDiff?date=" + dateStr,
                description: description,
                author: '股市药丸',
                pubDate: date.toUTCString(),
                guid: "gushiyaowan-" + item.date,
                enclosure: {
                    url: "http://gushiyaowan.com/favicon.ico",
                    length: "0",
                    type: "image/x-icon"
                }
            }
        })
        
        const channel = {
            title: '📊 股市药丸 - 股债收益差每日数据',
            description: '📈 每日跟踪沪深300指数PE估值、十年期国债收益率及股债收益差数据',
            link: 'http://gushiyaowan.com',
            image: 'http://gushiyaowan.com/favicon.ico'
        }
        
        return {
            data: itemsToRss(items, channel, format),
            isError: false,
        };
        
    } catch (error) {
        console.error('gushiyaowan错误:', error)
        
        const errorItems = [{
            title: '❌ 股债数据获取失败',
            link: 'http://gushiyaowan.com',
            description: "<![CDATA[⚠️ 数据获取失败<br><br>🔍 错误: " + error.message + "<br>⏰ 时间: " + new Date().toLocaleString('zh-CN') + "<br>💡 建议: 请稍后再试<br><br>🌐 官网: http://gushiyaowan.com]]>",
            pubDate: new Date().toUTCString(),
            guid: "error-" + Date.now(),
            author: '股市药丸',
            enclosure: {
                url: "http://gushiyaowan.com/favicon.ico",
                length: "0",
                type: "image/x-icon"
            }
        }]
        
        const errorChannel = {
            title: '❌ 股市药丸 - 数据获取错误',
            description: '⚠️ 数据获取遇到问题，请稍后重试',
            link: 'http://gushiyaowan.com',
            image: 'http://gushiyaowan.com/favicon.ico'
        }
        
        return {
            data: itemsToRss(errorItems, errorChannel, format),
            isError: true,
        };
    }
}
