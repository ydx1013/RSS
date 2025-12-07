// admin/router.js
// 后台管理路由处理器

import { verifyAuth, unauthorizedResponse } from './auth.js';
import {
    getAllSubscriptions,
    getSubscription,
    saveSubscription,
    deleteSubscription,
    exportSubscriptions,
    importSubscriptions,
    searchSubscriptions,
    getSubscriptionStats
} from './subscription.js';
import {
    clearRouteCache,
    clearMultipleCache,
    getAllCacheMetadata,
    getCacheStats,
    cleanExpiredMetadata
} from './cache.js';
import {
    getAllCustomRSS,
    getCustomRSS,
    saveCustomRSS,
    deleteCustomRSS,
    testRSSConfig,
    detectSelectors
} from './rss-builder.js';

/**
 * 处理管理后台请求
 * @param {Request} request - HTTP 请求
 * @param {Object} env - 环境变量
 */
export async function handleAdminRequest(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // 验证权限
    if (!verifyAuth(request, env)) {
        return unauthorizedResponse();
    }

    // KV 命名空间
    const KV = env.RSS_KV;
    if (!KV) {
        return jsonResponse({
            error: 'KV namespace not configured',
            message: '请在 wrangler.toml 中配置 KV 命名空间: [[kv_namespaces]]'
        }, 500);
    }

    const workerUrl = url.origin;

    try {
        // 路由分发
        if (path === '/admin' || path === '/admin/') {
            return getAdminDashboard(request, env);
        }

        // === 订阅管理 API ===
        if (path === '/admin/api/subscriptions') {
            if (method === 'GET') {
                const query = url.searchParams.get('q');
                const subs = query 
                    ? await searchSubscriptions(KV, query)
                    : await getAllSubscriptions(KV);
                return jsonResponse({ success: true, data: subs });
            }
            if (method === 'POST') {
                const body = await request.json();
                const saved = await saveSubscription(KV, body.id, body);
                return jsonResponse({ success: true, data: saved });
            }
        }

        if (path.startsWith('/admin/api/subscriptions/')) {
            const id = decodeURIComponent(path.replace('/admin/api/subscriptions/', ''));
            if (method === 'GET') {
                const sub = await getSubscription(KV, id);
                return sub 
                    ? jsonResponse({ success: true, data: sub })
                    : jsonResponse({ error: 'Not found' }, 404);
            }
            if (method === 'DELETE') {
                await deleteSubscription(KV, id);
                return jsonResponse({ success: true, message: '删除成功' });
            }
            if (method === 'PUT') {
                const body = await request.json();
                const updated = await saveSubscription(KV, id, body);
                return jsonResponse({ success: true, data: updated });
            }
        }

        if (path === '/admin/api/subscriptions/export') {
            const data = await exportSubscriptions(KV);
            return jsonResponse(data);
        }

        if (path === '/admin/api/subscriptions/import' && method === 'POST') {
            const body = await request.json();
            const result = await importSubscriptions(KV, body.subscriptions);
            return jsonResponse({ success: true, ...result });
        }

        if (path === '/admin/api/subscriptions/stats') {
            const stats = await getSubscriptionStats(KV);
            return jsonResponse({ success: true, data: stats });
        }

        // === 缓存管理 API ===
        if (path === '/admin/api/cache/clear' && method === 'POST') {
            const body = await request.json();
            if (body.routes && Array.isArray(body.routes)) {
                const result = await clearMultipleCache(body.routes, workerUrl);
                return jsonResponse({ success: true, ...result });
            } else if (body.routeName && body.param) {
                const result = await clearRouteCache(body.routeName, body.param, workerUrl);
                return jsonResponse(result);
            }
            return jsonResponse({ error: 'Invalid request' }, 400);
        }

        if (path === '/admin/api/cache/metadata') {
            const metadata = await getAllCacheMetadata(KV);
            return jsonResponse({ success: true, ...metadata });
        }

        if (path === '/admin/api/cache/stats') {
            const stats = await getCacheStats(KV);
            return jsonResponse({ success: true, data: stats });
        }

        if (path === '/admin/api/cache/clean' && method === 'POST') {
            const result = await cleanExpiredMetadata(KV);
            return jsonResponse(result);
        }

        // === RSS 生成器 API ===
        if (path === '/admin/api/rss-builder/configs') {
            if (method === 'GET') {
                const configs = await getAllCustomRSS(KV);
                return jsonResponse({ success: true, data: configs });
            }
            if (method === 'POST') {
                const body = await request.json();
                const saved = await saveCustomRSS(KV, body.id, body);
                return jsonResponse({ success: true, data: saved });
            }
        }

        if (path.startsWith('/admin/api/rss-builder/configs/')) {
            const id = decodeURIComponent(path.replace('/admin/api/rss-builder/configs/', ''));
            if (method === 'GET') {
                const config = await getCustomRSS(KV, id);
                return config 
                    ? jsonResponse({ success: true, data: config })
                    : jsonResponse({ error: 'Not found' }, 404);
            }
            if (method === 'DELETE') {
                await deleteCustomRSS(KV, id);
                return jsonResponse({ success: true, message: '删除成功' });
            }
            if (method === 'PUT') {
                const body = await request.json();
                const updated = await saveCustomRSS(KV, id, body);
                return jsonResponse({ success: true, data: updated });
            }
        }

        if (path === '/admin/api/rss-builder/test' && method === 'POST') {
            const body = await request.json();
            const result = await testRSSConfig(body, workerUrl);
            return jsonResponse(result);
        }

        if (path === '/admin/api/rss-builder/detect' && method === 'POST') {
            const body = await request.json();
            const suggestions = await detectSelectors(body.url);
            return jsonResponse({ success: true, data: suggestions });
        }

        // === 系统信息 API ===
        if (path === '/admin/api/system/info') {
            return jsonResponse({
                success: true,
                data: {
                    version: '1.0.0',
                    worker: workerUrl,
                    timestamp: new Date().toISOString(),
                    env: {
                        hasKV: !!env.RSS_KV,
                        hasAuth: !!(env.ADMIN_TOKEN || env.ADMIN_PASSWORD)
                    }
                }
            });
        }

        // 404
        return jsonResponse({ error: 'Not found', path }, 404);

    } catch (error) {
        console.error('Admin API Error:', error);
        return jsonResponse({
            error: 'Internal server error',
            message: error.message
        }, 500);
    }
}

/**
 * 获取管理后台 HTML 页面
 */
function getAdminDashboard(request, env) {
    const url = new URL(request.url);
    const token = url.searchParams.get('token') || env.ADMIN_TOKEN || '';
    
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WorkerRSS 管理后台</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .header h1 { font-size: 28px; font-weight: 600; }
        .header .badge {
            background: rgba(255,255,255,0.2);
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
        }
        .nav {
            display: flex;
            border-bottom: 1px solid #e5e7eb;
            background: #f9fafb;
            overflow-x: auto;
        }
        .nav button {
            flex: 1;
            min-width: 150px;
            padding: 16px 24px;
            border: none;
            background: transparent;
            cursor: pointer;
            font-size: 15px;
            font-weight: 500;
            color: #6b7280;
            transition: all 0.3s;
            border-bottom: 3px solid transparent;
        }
        .nav button:hover { background: white; color: #667eea; }
        .nav button.active {
            color: #667eea;
            background: white;
            border-bottom-color: #667eea;
        }
        .content {
            padding: 30px;
            min-height: 600px;
        }
        .tab-pane { display: none; }
        .tab-pane.active { display: block; }
        .card {
            background: white;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 20px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .card h3 {
            font-size: 18px;
            margin-bottom: 16px;
            color: #1f2937;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 24px;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
        }
        .stat-card h4 { font-size: 14px; opacity: 0.9; margin-bottom: 8px; }
        .stat-card .value { font-size: 36px; font-weight: 700; }
        .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.3s;
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }
        .btn-primary {
            background: #667eea;
            color: white;
        }
        .btn-primary:hover { background: #5568d3; }
        .btn-danger {
            background: #ef4444;
            color: white;
        }
        .btn-danger:hover { background: #dc2626; }
        .btn-success {
            background: #10b981;
            color: white;
        }
        .btn-success:hover { background: #059669; }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 16px;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #e5e7eb;
        }
        th {
            background: #f9fafb;
            font-weight: 600;
            color: #374151;
        }
        tr:hover { background: #f9fafb; }
        .input-group {
            margin-bottom: 16px;
        }
        .input-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: #374151;
        }
        .input-group input, .input-group select, .input-group textarea {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid #d1d5db;
            border-radius: 8px;
            font-size: 14px;
        }
        .input-group input:focus, .input-group select:focus, .input-group textarea:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        .loading {
            text-align: center;
            padding: 40px;
            color: #6b7280;
        }
        .spinner {
            border: 3px solid #f3f4f6;
            border-top: 3px solid #667eea;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 16px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: #6b7280;
        }
        .empty-state svg {
            width: 64px;
            height: 64px;
            margin-bottom: 16px;
            opacity: 0.5;
        }
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            z-index: 1000;
            align-items: center;
            justify-content: center;
        }
        .modal.active { display: flex; }
        .modal-content {
            background: white;
            border-radius: 16px;
            padding: 30px;
            max-width: 600px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
        }
        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }
        .modal-header h3 { font-size: 20px; }
        .close-btn {
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #6b7280;
        }
        .alert {
            padding: 12px 16px;
            border-radius: 8px;
            margin-bottom: 16px;
        }
        .alert-success {
            background: #d1fae5;
            color: #065f46;
            border: 1px solid #6ee7b7;
        }
        .alert-error {
            background: #fee2e2;
            color: #991b1b;
            border: 1px solid #fca5a5;
        }
        .badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 500;
        }
        .badge-primary { background: #dbeafe; color: #1e40af; }
        .badge-success { background: #d1fae5; color: #065f46; }
        .badge-warning { background: #fef3c7; color: #92400e; }
        .code-block {
            background: #1f2937;
            color: #f3f4f6;
            padding: 16px;
            border-radius: 8px;
            font-family: monospace;
            font-size: 13px;
            overflow-x: auto;
            margin: 16px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 WorkerRSS 管理后台</h1>
            <div class="badge">v1.0.0</div>
        </div>
        
        <div class="nav">
            <button class="active" onclick="switchTab('dashboard')">📊 仪表盘</button>
            <button onclick="switchTab('rss-builder')">🔧 RSS 生成器</button>
            <button onclick="switchTab('subscriptions')">📚 订阅管理</button>
            <button onclick="switchTab('cache')">💾 缓存管理</button>
            <button onclick="switchTab('settings')">⚙️ 系统设置</button>
        </div>

        <div class="content">
            <!-- 仪表盘 -->
            <div id="dashboard" class="tab-pane active">
                <div class="stats-grid" id="statsGrid">
                    <div class="loading">
                        <div class="spinner"></div>
                        <p>加载中...</p>
                    </div>
                </div>
                <div class="card">
                    <h3>📈 最近活动</h3>
                    <div id="recentActivity"></div>
                </div>
            </div>

            <!-- RSS 生成器 -->
            <div id="rss-builder" class="tab-pane">
                <div class="card">
                    <h3>🔧 创建自定义 RSS</h3>
                    <div class="input-group">
                        <label>目标网页 URL *</label>
                        <div style="display: flex; gap: 8px;">
                            <input type="text" id="targetUrl" placeholder="https://example.com/news" style="flex: 1;">
                            <button class="btn btn-primary" onclick="detectPage()">🔍 智能检测</button>
                            <button class="btn btn-success" onclick="fetchPreview()">👁️ 预览网页</button>
                        </div>
                    </div>
                    
                    <div id="detectionResult" style="margin: 16px 0;"></div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 20px 0;">
                        <div>
                            <h4 style="margin-bottom: 12px;">📋 选择器配置</h4>
                            <div class="input-group">
                                <label>容器选择器 *</label>
                                <input type="text" id="containerSelector" placeholder="article, .post, .item">
                                <small style="color: #6b7280;">每个文章/新闻项的容器</small>
                            </div>
                            <div class="input-group">
                                <label>标题选择器 *</label>
                                <input type="text" id="titleSelector" placeholder="h2, .title">
                            </div>
                            <div class="input-group">
                                <label>标题属性</label>
                                <input type="text" id="titleAttr" placeholder="留空则取文本，或填 title、alt 等">
                            </div>
                            <div class="input-group">
                                <label>链接选择器 *</label>
                                <input type="text" id="linkSelector" placeholder="a">
                            </div>
                            <div class="input-group">
                                <label>链接属性</label>
                                <input type="text" id="linkAttr" placeholder="默认 href">
                            </div>
                            <div class="input-group">
                                <label>描述选择器</label>
                                <input type="text" id="descSelector" placeholder="p, .summary, .content">
                            </div>
                            <div class="input-group">
                                <label>作者选择器</label>
                                <input type="text" id="authorSelector" placeholder=".author, .by">
                            </div>
                            <div class="input-group">
                                <label>日期选择器</label>
                                <input type="text" id="dateSelector" placeholder=".date, time">
                            </div>
                            <div class="input-group">
                                <label>图片选择器</label>
                                <input type="text" id="imageSelector" placeholder="img">
                            </div>
                            <div class="input-group">
                                <label>图片属性</label>
                                <input type="text" id="imageAttr" placeholder="默认 src，或填 data-src 等">
                            </div>
                        </div>
                        
                        <div>
                            <h4 style="margin-bottom: 12px;">ℹ️ RSS 频道信息</h4>
                            <div class="input-group">
                                <label>RSS 标题 *</label>
                                <input type="text" id="rssTitle" placeholder="我的自定义 RSS">
                            </div>
                            <div class="input-group">
                                <label>RSS 描述</label>
                                <input type="text" id="rssDescription" placeholder="RSS 描述信息">
                            </div>
                            <div class="input-group">
                                <label>RSS 图标 URL</label>
                                <input type="text" id="rssImage" placeholder="https://example.com/icon.png">
                            </div>
                            <div class="input-group">
                                <label>配置 ID *</label>
                                <input type="text" id="configId" placeholder="my-custom-rss（用于 URL 访问）">
                                <small style="color: #6b7280;">访问地址: ?custom=配置ID</small>
                            </div>
                            <div class="input-group">
                                <label>最大条目数</label>
                                <input type="number" id="maxItems" value="20" min="1" max="100">
                            </div>
                            
                            <div style="margin-top: 24px; padding: 16px; background: #f0f9ff; border-radius: 8px; border: 1px solid #bae6fd;">
                                <h5 style="margin-bottom: 8px; color: #0369a1;">💡 提示</h5>
                                <ul style="margin-left: 20px; color: #0369a1; font-size: 13px; line-height: 1.6;">
                                    <li>使用浏览器开发者工具（F12）查看网页结构</li>
                                    <li>CSS Selector: .class、#id、tag</li>
                                    <li>属性留空则取元素文本内容</li>
                                    <li>点击"智能检测"自动分析网页</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 12px; margin-top: 20px;">
                        <button class="btn btn-primary" onclick="testRSSConfig()" style="flex: 1;">
                            🧪 测试配置
                        </button>
                        <button class="btn btn-success" onclick="saveRSSConfig()" style="flex: 1;">
                            💾 保存配置
                        </button>
                        <button class="btn" onclick="resetRSSBuilder()" style="background: #6b7280; color: white;">
                            🔄 重置
                        </button>
                    </div>
                </div>
                
                <div class="card">
                    <h3>📄 预览结果</h3>
                    <div id="rssPreview"></div>
                </div>
                
                <div class="card">
                    <h3>📋 已保存的配置</h3>
                    <div id="customRssList"></div>
                </div>
            </div>

            <!-- 订阅管理 -->
            <div id="subscriptions" class="tab-pane">
                <div class="card">
                    <h3>📚 订阅列表</h3>
                    <div style="display: flex; gap: 12px; margin-bottom: 16px;">
                        <input type="text" id="searchInput" placeholder="搜索订阅..." 
                               style="flex: 1; padding: 10px; border: 1px solid #d1d5db; border-radius: 8px;">
                        <button class="btn btn-primary" onclick="showAddModal()">➕ 添加订阅</button>
                        <button class="btn btn-success" onclick="exportSubs()">📥 导出</button>
                        <button class="btn btn-primary" onclick="showImportModal()">📤 导入</button>
                    </div>
                    <div id="subscriptionsList"></div>
                </div>
            </div>

            <!-- 缓存管理 -->
            <div id="cache" class="tab-pane">
                <div class="card">
                    <h3>💾 缓存统计</h3>
                    <div id="cacheStats"></div>
                </div>
                <div class="card">
                    <h3>🗑️ 缓存清理</h3>
                    <div style="display: flex; gap: 12px; margin-bottom: 16px;">
                        <button class="btn btn-danger" onclick="clearAllCache()">清除所有缓存</button>
                        <button class="btn btn-primary" onclick="cleanExpired()">清理过期元数据</button>
                    </div>
                    <div id="cacheList"></div>
                </div>
            </div>

            <!-- 系统设置 -->
            <div id="settings" class="tab-pane">
                <div class="card">
                    <h3>⚙️ 系统信息</h3>
                    <div id="systemInfo"></div>
                </div>
                <div class="card">
                    <h3>🔑 API 文档</h3>
                    <div class="code-block" id="apiDocs"></div>
                </div>
            </div>
        </div>
    </div>

    <!-- 添加订阅模态框 -->
    <div id="addModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3>添加订阅</h3>
                <button class="close-btn" onclick="closeModal('addModal')">&times;</button>
            </div>
            <div class="input-group">
                <label>订阅 ID *</label>
                <input type="text" id="subId" placeholder="例如: github_owner/repo">
            </div>
            <div class="input-group">
                <label>名称</label>
                <input type="text" id="subName" placeholder="订阅显示名称">
            </div>
            <div class="input-group">
                <label>平台</label>
                <select id="subPlatform">
                    <option value="github">GitHub</option>
                    <option value="bilibili">Bilibili</option>
                    <option value="telegram">Telegram</option>
                    <option value="cctv">CCTV</option>
                    <option value="other">其他</option>
                </select>
            </div>
            <div class="input-group">
                <label>标签（逗号分隔）</label>
                <input type="text" id="subTags" placeholder="tech, news">
            </div>
            <div class="input-group">
                <label>备注</label>
                <textarea id="subNote" rows="3" placeholder="可选备注"></textarea>
            </div>
            <button class="btn btn-primary" onclick="saveSub()" style="width: 100%;">保存</button>
        </div>
    </div>

    <!-- 导入模态框 -->
    <div id="importModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3>导入订阅</h3>
                <button class="close-btn" onclick="closeModal('importModal')">&times;</button>
            </div>
            <div class="input-group">
                <label>JSON 数据</label>
                <textarea id="importData" rows="10" placeholder='{"subscriptions": [...]}'></textarea>
            </div>
            <button class="btn btn-primary" onclick="importSubs()" style="width: 100%;">导入</button>
        </div>
    </div>

    <script>
        const API_TOKEN = '${token}';
        const BASE_URL = window.location.origin;
        
        // 工具函数
        async function apiCall(path, options = {}) {
            options.headers = options.headers || {};
            options.headers['Authorization'] = 'Bearer ' + API_TOKEN;
            options.headers['Content-Type'] = 'application/json';
            
            const res = await fetch(BASE_URL + path, options);
            if (!res.ok) throw new Error('API 请求失败: ' + res.status);
            return await res.json();
        }

        // 标签切换
        function switchTab(tab) {
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
            document.getElementById(tab).classList.add('active');
            event.target.classList.add('active');
            
            if (tab === 'dashboard') loadDashboard();
            if (tab === 'rss-builder') loadRSSBuilder();
            if (tab === 'subscriptions') loadSubscriptions();
            if (tab === 'cache') loadCache();
            if (tab === 'settings') loadSettings();
        }

        // 加载仪表盘
        async function loadDashboard() {
            try {
                const stats = await apiCall('/admin/api/subscriptions/stats');
                const cacheStats = await apiCall('/admin/api/cache/stats');
                
                document.getElementById('statsGrid').innerHTML = \`
                    <div class="stat-card">
                        <h4>总订阅数</h4>
                        <div class="value">\${stats.data.total}</div>
                    </div>
                    <div class="stat-card">
                        <h4>缓存条目</h4>
                        <div class="value">\${cacheStats.data.total || 0}</div>
                    </div>
                    <div class="stat-card">
                        <h4>平台数量</h4>
                        <div class="value">\${Object.keys(stats.data.byPlatform).length}</div>
                    </div>
                    <div class="stat-card">
                        <h4>系统状态</h4>
                        <div class="value">✅ 正常</div>
                    </div>
                \`;

                const recent = stats.data.recentlyAdded.map(s => 
                    \`<div style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
                        <strong>\${s.id}</strong> - \${s.platform || 'unknown'}
                        <span style="float: right; color: #6b7280; font-size: 12px;">
                            \${new Date(s.createdAt).toLocaleDateString('zh-CN')}
                        </span>
                    </div>\`
                ).join('');
                
                document.getElementById('recentActivity').innerHTML = recent || '<div class="empty-state">暂无数据</div>';
            } catch (e) {
                console.error(e);
            }
        }

        // === RSS 生成器功能 ===
        async function loadRSSBuilder() {
            await loadCustomRssList();
        }

        async function loadCustomRssList() {
            try {
                const res = await apiCall('/admin/api/rss-builder/configs');
                const configs = res.data;
                
                if (configs.length === 0) {
                    document.getElementById('customRssList').innerHTML = 
                        '<div class="empty-state">暂无配置，创建你的第一个自定义 RSS</div>';
                    return;
                }

                const table = \`
                    <table>
                        <thead>
                            <tr>
                                <th>配置 ID</th>
                                <th>标题</th>
                                <th>URL</th>
                                <th>创建时间</th>
                                <th>RSS 地址</th>
                                <th>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            \${configs.map(c => \`
                                <tr>
                                    <td><code>\${c.id}</code></td>
                                    <td>\${c.channelInfo?.title || '-'}</td>
                                    <td><a href="\${c.url}" target="_blank" style="color: #667eea; text-decoration: none;">\${c.url.substring(0, 40)}...</a></td>
                                    <td>\${new Date(c.createdAt).toLocaleString('zh-CN')}</td>
                                    <td><button class="btn btn-primary" onclick="copyRssUrl('\${c.id}')" style="padding: 4px 8px; font-size: 12px;">📋 复制</button></td>
                                    <td>
                                        <button class="btn btn-primary" onclick="editRssConfig('\${c.id}')" style="padding: 6px 12px; font-size: 12px; margin-right: 4px;">编辑</button>
                                        <button class="btn btn-danger" onclick="deleteRssConfig('\${c.id}')" style="padding: 6px 12px; font-size: 12px;">删除</button>
                                    </td>
                                </tr>
                            \`).join('')}
                        </tbody>
                    </table>
                \`;
                document.getElementById('customRssList').innerHTML = table;
            } catch (e) {
                console.error(e);
                document.getElementById('customRssList').innerHTML = 
                    '<div class="alert alert-error">加载失败: ' + e.message + '</div>';
            }
        }

        async function detectPage() {
            const url = document.getElementById('targetUrl').value.trim();
            if (!url) {
                alert('请输入目标网页 URL');
                return;
            }

            document.getElementById('detectionResult').innerHTML = '<div class="loading"><div class="spinner"></div><p>正在智能检测...</p></div>';

            try {
                const res = await apiCall('/admin/api/rss-builder/detect', {
                    method: 'POST',
                    body: JSON.stringify({ url })
                });

                if (res.success) {
                    const data = res.data;
                    
                    // 填充检测到的信息
                    document.getElementById('containerSelector').value = data.selectors?.container || '';
                    document.getElementById('titleSelector').value = data.selectors?.title || '';
                    document.getElementById('linkSelector').value = data.selectors?.link || '';
                    document.getElementById('descSelector').value = data.selectors?.description || '';
                    document.getElementById('rssTitle').value = data.channelInfo?.title || '';
                    document.getElementById('rssDescription').value = data.channelInfo?.description || '';
                    document.getElementById('rssImage').value = data.channelInfo?.image || '';

                    // 显示建议
                    let suggestionsHtml = '<div class="alert alert-success">✅ 检测完成！已自动填充建议值</div>';
                    
                    if (data.suggestions) {
                        suggestionsHtml += '<div style="margin-top: 12px; padding: 12px; background: #f3f4f6; border-radius: 8px;">';
                        suggestionsHtml += '<h5 style="margin-bottom: 8px;">🔍 其他可能的选择器：</h5>';
                        
                        if (data.suggestions.containers?.length) {
                            suggestionsHtml += '<p><strong>容器:</strong> ' + data.suggestions.containers.slice(0, 5).map(s => \`<code style="margin: 0 4px;">\${s}</code>\`).join('') + '</p>';
                        }
                        if (data.suggestions.titles?.length) {
                            suggestionsHtml += '<p><strong>标题:</strong> ' + data.suggestions.titles.slice(0, 5).map(s => \`<code style="margin: 0 4px;">\${s}</code>\`).join('') + '</p>';
                        }
                        
                        suggestionsHtml += '</div>';
                    }

                    document.getElementById('detectionResult').innerHTML = suggestionsHtml;
                } else {
                    document.getElementById('detectionResult').innerHTML = 
                        '<div class="alert alert-error">检测失败: ' + (res.error || '未知错误') + '</div>';
                }
            } catch (e) {
                document.getElementById('detectionResult').innerHTML = 
                    '<div class="alert alert-error">检测失败: ' + e.message + '</div>';
            }
        }

        async function testRSSConfig() {
            const config = getRSSConfigFromForm();
            if (!config) return;

            document.getElementById('rssPreview').innerHTML = '<div class="loading"><div class="spinner"></div><p>正在测试配置...</p></div>';

            try {
                const res = await apiCall('/admin/api/rss-builder/test', {
                    method: 'POST',
                    body: JSON.stringify(config)
                });

                if (res.success) {
                    let previewHtml = '<div class="alert alert-success">✅ 测试成功！找到 ' + res.itemsCount + ' 条记录</div>';
                    
                    if (res.items && res.items.length > 0) {
                        previewHtml += '<h4 style="margin: 16px 0 12px 0;">预览前 5 条：</h4>';
                        previewHtml += '<div style="max-height: 400px; overflow-y: auto;">';
                        res.items.forEach((item, idx) => {
                            previewHtml += \`
                                <div style="padding: 12px; margin-bottom: 8px; border: 1px solid #e5e7eb; border-radius: 8px; background: #f9fafb;">
                                    <div style="font-weight: 600; margin-bottom: 4px;">\${idx + 1}. \${item.title || '(无标题)'}</div>
                                    <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">
                                        链接: <a href="\${item.link}" target="_blank" style="color: #667eea;">\${item.link || '(无)'}</a>
                                    </div>
                                    <div style="font-size: 12px; color: #6b7280;">
                                        作者: \${item.author || '(无)'} | 日期: \${item.pubDate || '(无)'}
                                    </div>
                                </div>
                            \`;
                        });
                        previewHtml += '</div>';
                    }

                    // RSS XML 预览
                    previewHtml += '<details style="margin-top: 16px;"><summary style="cursor: pointer; font-weight: 600;">📄 查看生成的 RSS XML</summary>';
                    previewHtml += '<pre style="background: #1f2937; color: #f3f4f6; padding: 16px; border-radius: 8px; overflow-x: auto; font-size: 12px; margin-top: 8px;">' + 
                                   escapeHtml(res.rss) + '</pre></details>';

                    document.getElementById('rssPreview').innerHTML = previewHtml;
                } else {
                    document.getElementById('rssPreview').innerHTML = 
                        '<div class="alert alert-error">❌ 测试失败<br>' + (res.error || '未知错误') + '</div>';
                }
            } catch (e) {
                document.getElementById('rssPreview').innerHTML = 
                    '<div class="alert alert-error">测试失败: ' + e.message + '</div>';
            }
        }

        async function saveRSSConfig() {
            const config = getRSSConfigFromForm();
            if (!config) return;

            const configId = document.getElementById('configId').value.trim();
            if (!configId) {
                alert('请输入配置 ID');
                return;
            }

            try {
                const res = await apiCall('/admin/api/rss-builder/configs', {
                    method: 'POST',
                    body: JSON.stringify({ id: configId, ...config })
                });

                if (res.success) {
                    alert('✅ 保存成功！\\n\\nRSS 访问地址：\\n' + BASE_URL + '/?custom=' + configId);
                    resetRSSBuilder();
                    await loadCustomRssList();
                } else {
                    alert('保存失败: ' + (res.error || '未知错误'));
                }
            } catch (e) {
                alert('保存失败: ' + e.message);
            }
        }

        async function editRssConfig(id) {
            try {
                const res = await apiCall('/admin/api/rss-builder/configs/' + encodeURIComponent(id));
                if (res.success) {
                    const config = res.data;
                    
                    // 填充表单
                    document.getElementById('targetUrl').value = config.url || '';
                    document.getElementById('containerSelector').value = config.selectors?.container || '';
                    document.getElementById('titleSelector').value = config.selectors?.title || '';
                    document.getElementById('titleAttr').value = config.selectors?.titleAttr || '';
                    document.getElementById('linkSelector').value = config.selectors?.link || '';
                    document.getElementById('linkAttr').value = config.selectors?.linkAttr || '';
                    document.getElementById('descSelector').value = config.selectors?.description || '';
                    document.getElementById('authorSelector').value = config.selectors?.author || '';
                    document.getElementById('dateSelector').value = config.selectors?.pubDate || '';
                    document.getElementById('imageSelector').value = config.selectors?.image || '';
                    document.getElementById('imageAttr').value = config.selectors?.imageAttr || '';
                    document.getElementById('rssTitle').value = config.channelInfo?.title || '';
                    document.getElementById('rssDescription').value = config.channelInfo?.description || '';
                    document.getElementById('rssImage').value = config.channelInfo?.image || '';
                    document.getElementById('configId').value = id;
                    document.getElementById('maxItems').value = config.maxItems || 20;

                    // 滚动到顶部
                    document.getElementById('rss-builder').scrollIntoView({ behavior: 'smooth' });
                }
            } catch (e) {
                alert('加载配置失败: ' + e.message);
            }
        }

        async function deleteRssConfig(id) {
            if (!confirm('确定要删除配置 "' + id + '" 吗？')) return;
            
            try {
                await apiCall('/admin/api/rss-builder/configs/' + encodeURIComponent(id), {
                    method: 'DELETE'
                });
                alert('删除成功！');
                await loadCustomRssList();
            } catch (e) {
                alert('删除失败: ' + e.message);
            }
        }

        function copyRssUrl(id) {
            const url = BASE_URL + '/?custom=' + id;
            navigator.clipboard.writeText(url).then(() => {
                alert('✅ RSS 地址已复制到剪贴板：\\n' + url);
            }).catch(() => {
                prompt('RSS 地址（Ctrl+C 复制）:', url);
            });
        }

        function resetRSSBuilder() {
            document.getElementById('targetUrl').value = '';
            document.getElementById('containerSelector').value = '';
            document.getElementById('titleSelector').value = '';
            document.getElementById('titleAttr').value = '';
            document.getElementById('linkSelector').value = '';
            document.getElementById('linkAttr').value = '';
            document.getElementById('descSelector').value = '';
            document.getElementById('authorSelector').value = '';
            document.getElementById('dateSelector').value = '';
            document.getElementById('imageSelector').value = '';
            document.getElementById('imageAttr').value = '';
            document.getElementById('rssTitle').value = '';
            document.getElementById('rssDescription').value = '';
            document.getElementById('rssImage').value = '';
            document.getElementById('configId').value = '';
            document.getElementById('maxItems').value = '20';
            document.getElementById('detectionResult').innerHTML = '';
            document.getElementById('rssPreview').innerHTML = '<div class="empty-state">配置并测试后，这里会显示预览结果</div>';
        }

        function getRSSConfigFromForm() {
            const url = document.getElementById('targetUrl').value.trim();
            const container = document.getElementById('containerSelector').value.trim();
            const title = document.getElementById('titleSelector').value.trim();
            const link = document.getElementById('linkSelector').value.trim();

            if (!url) {
                alert('请输入目标网页 URL');
                return null;
            }
            if (!container) {
                alert('请输入容器选择器');
                return null;
            }
            if (!title) {
                alert('请输入标题选择器');
                return null;
            }
            if (!link) {
                alert('请输入链接选择器');
                return null;
            }

            return {
                url,
                selectors: {
                    container,
                    title,
                    titleAttr: document.getElementById('titleAttr').value.trim(),
                    link,
                    linkAttr: document.getElementById('linkAttr').value.trim() || 'href',
                    description: document.getElementById('descSelector').value.trim(),
                    author: document.getElementById('authorSelector').value.trim(),
                    pubDate: document.getElementById('dateSelector').value.trim(),
                    image: document.getElementById('imageSelector').value.trim(),
                    imageAttr: document.getElementById('imageAttr').value.trim() || 'src'
                },
                channelInfo: {
                    title: document.getElementById('rssTitle').value.trim(),
                    description: document.getElementById('rssDescription').value.trim(),
                    image: document.getElementById('rssImage').value.trim()
                },
                maxItems: parseInt(document.getElementById('maxItems').value) || 20
            };
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function fetchPreview() {
            const url = document.getElementById('targetUrl').value.trim();
            if (url) {
                window.open(url, '_blank');
            } else {
                alert('请先输入目标网页 URL');
            }
        }

        // 加载订阅列表
        async function loadSubscriptions() {
            try {
                const res = await apiCall('/admin/api/subscriptions');
                const subs = res.data;
                
                if (subs.length === 0) {
                    document.getElementById('subscriptionsList').innerHTML = 
                        '<div class="empty-state">暂无订阅，点击"添加订阅"开始</div>';
                    return;
                }

                const table = \`
                    <table>
                        <thead>
                            <tr>
                                <th>订阅 ID</th>
                                <th>名称</th>
                                <th>平台</th>
                                <th>标签</th>
                                <th>创建时间</th>
                                <th>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            \${subs.map(s => \`
                                <tr>
                                    <td><code>\${s.id}</code></td>
                                    <td>\${s.name || '-'}</td>
                                    <td><span class="badge badge-primary">\${s.platform || 'unknown'}</span></td>
                                    <td>\${(s.tags || []).join(', ') || '-'}</td>
                                    <td>\${new Date(s.createdAt).toLocaleDateString('zh-CN')}</td>
                                    <td>
                                        <button class="btn btn-danger" onclick="deleteSub('\${s.id}')" 
                                                style="padding: 6px 12px; font-size: 12px;">删除</button>
                                    </td>
                                </tr>
                            \`).join('')}
                        </tbody>
                    </table>
                \`;
                document.getElementById('subscriptionsList').innerHTML = table;
            } catch (e) {
                console.error(e);
                document.getElementById('subscriptionsList').innerHTML = 
                    '<div class="alert alert-error">加载失败: ' + e.message + '</div>';
            }
        }

        // 保存订阅
        async function saveSub() {
            const id = document.getElementById('subId').value.trim();
            if (!id) {
                alert('请输入订阅 ID');
                return;
            }

            const data = {
                id,
                name: document.getElementById('subName').value.trim(),
                platform: document.getElementById('subPlatform').value,
                tags: document.getElementById('subTags').value.split(',').map(t => t.trim()).filter(Boolean),
                note: document.getElementById('subNote').value.trim()
            };

            try {
                await apiCall('/admin/api/subscriptions', {
                    method: 'POST',
                    body: JSON.stringify(data)
                });
                closeModal('addModal');
                loadSubscriptions();
                alert('保存成功！');
            } catch (e) {
                alert('保存失败: ' + e.message);
            }
        }

        // 删除订阅
        async function deleteSub(id) {
            if (!confirm('确定要删除订阅 "' + id + '" 吗？')) return;
            
            try {
                await apiCall('/admin/api/subscriptions/' + encodeURIComponent(id), {
                    method: 'DELETE'
                });
                loadSubscriptions();
                alert('删除成功！');
            } catch (e) {
                alert('删除失败: ' + e.message);
            }
        }

        // 导出订阅
        async function exportSubs() {
            try {
                const data = await apiCall('/admin/api/subscriptions/export');
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'subscriptions-' + new Date().toISOString().split('T')[0] + '.json';
                a.click();
            } catch (e) {
                alert('导出失败: ' + e.message);
            }
        }

        // 导入订阅
        async function importSubs() {
            const data = document.getElementById('importData').value.trim();
            if (!data) {
                alert('请输入 JSON 数据');
                return;
            }

            try {
                const json = JSON.parse(data);
                const res = await apiCall('/admin/api/subscriptions/import', {
                    method: 'POST',
                    body: JSON.stringify(json)
                });
                closeModal('importModal');
                loadSubscriptions();
                alert(\`导入完成！成功: \${res.success} 条，失败: \${res.failed} 条\`);
            } catch (e) {
                alert('导入失败: ' + e.message);
            }
        }

        // 加载缓存管理
        async function loadCache() {
            try {
                const stats = await apiCall('/admin/api/cache/stats');
                const metadata = await apiCall('/admin/api/cache/metadata');
                
                const statsHtml = \`
                    <p><strong>总缓存条目:</strong> \${stats.data.total || 0}</p>
                    <p><strong>按路由统计:</strong></p>
                    <ul>
                        \${Object.entries(stats.data.byRoute || {}).map(([k, v]) => 
                            \`<li>\${k}: \${v} 条</li>\`
                        ).join('')}
                    </ul>
                \`;
                document.getElementById('cacheStats').innerHTML = statsHtml;

                if (metadata.items && metadata.items.length > 0) {
                    const table = \`
                        <table>
                            <thead>
                                <tr>
                                    <th>路由</th>
                                    <th>参数</th>
                                    <th>最后访问</th>
                                    <th>过期时间</th>
                                    <th>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                \${metadata.items.slice(0, 20).map(m => {
                                    const [route, ...paramParts] = m.key.split(':');
                                    const param = paramParts.join(':');
                                    return \`
                                        <tr>
                                            <td><span class="badge badge-primary">\${route}</span></td>
                                            <td><code>\${param}</code></td>
                                            <td>\${new Date(m.lastAccess).toLocaleString('zh-CN')}</td>
                                            <td>\${new Date(m.expiresAt).toLocaleString('zh-CN')}</td>
                                            <td>
                                                <button class="btn btn-danger" 
                                                        onclick="clearCache('\${route}', '\${param}')"
                                                        style="padding: 6px 12px; font-size: 12px;">清除</button>
                                            </td>
                                        </tr>
                                    \`;
                                }).join('')}
                            </tbody>
                        </table>
                    \`;
                    document.getElementById('cacheList').innerHTML = table;
                } else {
                    document.getElementById('cacheList').innerHTML = '<div class="empty-state">暂无缓存数据</div>';
                }
            } catch (e) {
                console.error(e);
            }
        }

        // 清除指定缓存
        async function clearCache(routeName, param) {
            try {
                await apiCall('/admin/api/cache/clear', {
                    method: 'POST',
                    body: JSON.stringify({ routeName, param })
                });
                alert('缓存已清除');
                loadCache();
            } catch (e) {
                alert('清除失败: ' + e.message);
            }
        }

        // 清除所有缓存
        async function clearAllCache() {
            if (!confirm('确定要清除所有缓存吗？这将影响所有路由的性能。')) return;
            alert('此功能需要遍历所有缓存元数据，请在缓存列表中逐个清除。');
        }

        // 清理过期元数据
        async function cleanExpired() {
            try {
                const res = await apiCall('/admin/api/cache/clean', { method: 'POST' });
                alert(res.message);
                loadCache();
            } catch (e) {
                alert('清理失败: ' + e.message);
            }
        }

        // 加载系统设置
        async function loadSettings() {
            try {
                const info = await apiCall('/admin/api/system/info');
                
                document.getElementById('systemInfo').innerHTML = \`
                    <p><strong>版本:</strong> \${info.data.version}</p>
                    <p><strong>Worker URL:</strong> <code>\${info.data.worker}</code></p>
                    <p><strong>KV 命名空间:</strong> \${info.data.env.hasKV ? '✅ 已配置' : '❌ 未配置'}</p>
                    <p><strong>认证:</strong> \${info.data.env.hasAuth ? '✅ 已启用' : '⚠️ 未配置'}</p>
                    <p><strong>时间:</strong> \${new Date(info.data.timestamp).toLocaleString('zh-CN')}</p>
                \`;

                document.getElementById('apiDocs').textContent = \`
# WorkerRSS Admin API 文档

## 认证
所有请求需要在 Header 中携带:
Authorization: Bearer YOUR_TOKEN

## 订阅管理
GET    /admin/api/subscriptions        # 获取所有订阅
POST   /admin/api/subscriptions        # 创建订阅
GET    /admin/api/subscriptions/:id    # 获取单个订阅
PUT    /admin/api/subscriptions/:id    # 更新订阅
DELETE /admin/api/subscriptions/:id    # 删除订阅
GET    /admin/api/subscriptions/export # 导出订阅
POST   /admin/api/subscriptions/import # 导入订阅
GET    /admin/api/subscriptions/stats  # 订阅统计

## 缓存管理
POST   /admin/api/cache/clear          # 清除缓存
GET    /admin/api/cache/metadata       # 获取缓存元数据
GET    /admin/api/cache/stats          # 缓存统计
POST   /admin/api/cache/clean          # 清理过期元数据

## 系统信息
GET    /admin/api/system/info          # 系统信息
                \`;
            } catch (e) {
                console.error(e);
            }
        }

        // 模态框控制
        function showAddModal() {
            document.getElementById('addModal').classList.add('active');
        }

        function showImportModal() {
            document.getElementById('importModal').classList.add('active');
        }

        function closeModal(id) {
            document.getElementById(id).classList.remove('active');
        }

        // 搜索功能
        document.getElementById('searchInput')?.addEventListener('input', async (e) => {
            const query = e.target.value.trim();
            if (query) {
                const res = await apiCall('/admin/api/subscriptions?q=' + encodeURIComponent(query));
                // 渲染搜索结果...
            } else {
                loadSubscriptions();
            }
        });

        // 初始化
        loadDashboard();
    </script>
</body>
</html>`;

    return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
}

/**
 * JSON 响应辅助函数
 */
function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data, null, 2), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
}
