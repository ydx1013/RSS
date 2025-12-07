/**
 * 解螺旋课程RSS解析器
 * 网站：https://www.helixlife.cn/edu/courses
 * 提取课程列表、标题、描述、学习人数等信息
 */

import { itemsToRss } from "../rss.js"

/**
 * 解螺旋课程RSS处理函数
 * @param {string} paramValue - URL参数值 (目前只支持基础课程列表)
 * @param {string} workerUrl - Worker的URL地址
 * @returns {string} RSS XML格式的课程列表
 */
export default async function (params) {
    const { param: paramValue, format, maxItems } = params;
    try {
        // 解螺旋课程API端点 - 获取课程列表数据
        const apiUrl = 'https://api.helixlife.cn/api/v1/edu/courses?f=JTdCJTIyc3RhdHVzJTIyOiUyMm5ldyUyMiwlMjJpc192aXAlMjI6MCwlMjJwYWdlJTIyOjEsJTIycGFnZV9zaXplJTIyOjIwLCUyMmNhdGVnb3J5X3V1aWQlMjI6JTIyJTIyJTdE';
        
        // 构建请求选项，模拟浏览器
        const requestOptions = {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Referer': 'https://www.helixlife.cn/edu/courses',
                'Origin': 'https://www.helixlife.cn'
            }
        };

        console.log(`Fetching 解螺旋课程 from API: ${apiUrl}`);

        // 发起请求获取课程数据
        const response = await fetch(apiUrl, requestOptions);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const responseText = await response.text();
        
        // 如果参数值为'raw'，直接返回原始响应
        if (paramValue === 'raw') {
            return responseText;
        }

        // 解析JSON响应
        const courseData = JSON.parse(responseText);

        console.log(`Course data structure:`, courseData.success ? '✅ Success' : '❌ Failed', courseData.code);

        const courses = [];

        // 解析解螺旋API响应结构: {success, code, message, data: {data: [...], meta: {...}}}
        if (courseData && courseData.success && courseData.data && courseData.data.data && Array.isArray(courseData.data.data)) {
            console.log(`Found ${courseData.data.data.length} courses from API`);
            
            courseData.data.data.forEach((course, index) => {
                courses.push(parseCourseItem(course, index));
            });
        } else {
            console.log('Unexpected course data structure:', courseData);
            throw new Error('Invalid API response structure');
        }

        // 按课程链接去重（防止重复课程）
        const uniqueCourses = courses.filter((course, index, self) => 
            index === self.findIndex(c => c.link === course.link)
        );

        console.log(`Processed ${uniqueCourses.length} unique courses`);

        let finalCourses = uniqueCourses;
        if (finalCourses.length > maxItems) {
            finalCourses = finalCourses.slice(0, maxItems);
        }

        // 构建 RSS 频道信息
        const channel = {
            title: "解螺旋课程更新",
            link: "https://www.helixlife.cn/edu/courses",
            description: "解螺旋(HelixLife)在线课程更新动态 - 科研学习平台课程推荐",
            image: "https://www.helixlife.cn/favicon.ico"
        };

        // 使用通用函数生成RSS
        return {
            data: itemsToRss(finalCourses, channel, format),
            isError: false,
        };

    } catch (error) {
        console.error('Error in helixlife RSS:', error);
        
        // 返回错误信息的RSS
        const errorItems = [{
            title: 'RSS获取错误',
            link: 'https://www.helixlife.cn/edu/courses',
            description: `获取解螺旋课程信息时发生错误：${error.message}`,
            pubDate: new Date().toUTCString(),
            guid: `error-${Date.now()}`,
            category: '错误'
        }];
        
        const errorChannel = {
            title: '解螺旋课程RSS - 错误',
            link: 'https://www.helixlife.cn/edu/courses',
            description: 'RSS获取过程中发生错误',
            image: 'https://www.helixlife.cn/favicon.ico'
        };
        
        return {
            data: itemsToRss(errorItems, errorChannel, format),
            isError: true,
        };
    }
}

/**
 * 解析单个课程项目
 * @param {Object} course - 课程数据对象 (来自解螺旋API)
 * @param {number} index - 索引
 * @returns {Object} 格式化的课程对象
 */
function parseCourseItem(course, index) {
    try {
        // 根据解螺旋API响应结构提取课程信息
        const title = course.title || `课程 ${index + 1}`;
        const courseId = course.uuid || course.id || index;
        const courseUrl = `https://www.helixlife.cn/edu/course/${courseId}`;
        
        // 课程基本信息
        const summary = course.summary || '';
        const subheading = course.subheading || '';
        const subtitle = course.subtitle || '';
        
        // 课程统计信息
        const buyCount = course.buy_count || 0;
        const favoriteCount = course.favorite_count || 0;
        const lessonCount = course.lesson_count || 0;
        const length = course.length || 0; // 课程总时长(秒)
        const difficulty = course.difficulty || 0; // 难度等级
        
        // 课程评分信息
        const rating = course.rating || '暂无评分';
        const ratingPractical = course.rating_practical || '';
        const ratingLogic = course.rating_logic || '';
        const ratingPopular = course.rating_popular || '';
        
        // 价格信息
        const marketing = course.marketing || {};
        const price = marketing.price || '0.00';
        const isDiscount = marketing.is_discount || false;
        const discount = marketing.discount || '0.00';
        
        // 会员和类型信息
        const isVip = course.is_vip || false;
        const type = course.type || 'course';
        const status = course.status || '';
        
        // 分类信息
        const category = course.category || {};
        const categoryName = category.name || '';
        const categoryCode = category.code || '';
        
        // 图片信息
        const coverLong = course.cover_long || '';
        const coverSquare = course.cover_square || '';
        
        // 时间信息
        const createdAt = course.created_at || '';
        
        // 将时长从秒转换为分钟显示
        const durationMinutes = Math.floor(length / 60);
        const durationHours = Math.floor(durationMinutes / 60);
        const durationText = durationHours > 0 ? 
            `${durationHours}小时${durationMinutes % 60}分钟` : 
            `${durationMinutes}分钟`;
        
        // 难度等级映射
        const difficultyMap = {
            0: '入门',
            1: '初级', 
            2: '中级',
            3: '高级',
            4: '专家'
        };
        const difficultyText = difficultyMap[difficulty] || '未知';
        
        // 构建详细描述
        let detailedDescription = summary;
        if (subheading) detailedDescription += `<br/><strong>副标题：</strong>${subheading}`;
        if (subtitle) detailedDescription += `<br/><strong>子标题：</strong>${subtitle}`;
        if (categoryName) detailedDescription += `<br/>� 分类：${categoryName}`;
        if (difficultyText !== '未知') detailedDescription += `<br/>📊 难度：${difficultyText}`;
        if (lessonCount > 0) detailedDescription += `<br/>📖 课节：${lessonCount}节`;
        if (durationMinutes > 0) detailedDescription += `<br/>⏱️ 时长：${durationText}`;
        
        // 发布时间
        if (createdAt) {
            const publishDate = new Date(createdAt);
            detailedDescription += `<br/>📅 发布：${publishDate.toLocaleDateString('zh-CN')}`;
        }
        
        // 如果有封面图片，添加到描述中
        if (coverLong) {
            detailedDescription += `<br/><img src="${coverLong}" alt="${title}" style="max-width: 400px; margin: 10px 0; border-radius: 8px;"/>`;
        }
        
        return {
            title: title,
            link: courseUrl,
            description: `<![CDATA[${detailedDescription.trim() || '解螺旋课程'}]]>`,
            pubDate: createdAt ? new Date(createdAt).toUTCString() : new Date().toUTCString(),
            guid: courseUrl, // 使用完整URL作为guid，更符合标准
            author: '解螺旋', // 修复：直接使用"解螺旋"作为作者
            category: categoryName || '在线课程',
            enclosure: coverLong ? {
                url: coverLong,
                length: "0", 
                type: "image/jpeg"
            } : undefined
        };
    } catch (err) {
        console.log(`Error parsing course item ${index}:`, err.message);
        return {
            title: `课程解析错误 ${index + 1}`,
            link: 'https://www.helixlife.cn/edu/courses',
            description: `<![CDATA[解析课程信息时发生错误：${err.message}]]>`,
            pubDate: new Date().toUTCString(),
            guid: `helixlife-error-${index}-${Date.now()}`,
            author: '系统',
            category: '错误'
        };
    }
}

