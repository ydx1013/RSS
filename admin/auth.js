// admin/auth.js
// 认证中间件 - 支持 Token 和 Basic Auth 两种方式

/**
 * 验证管理员权限
 * @param {Request} request - HTTP 请求对象
 * @param {Object} env - Cloudflare Worker 环境变量
 * @returns {boolean} - 是否通过验证
 */
export function verifyAuth(request, env) {
    // 从环境变量获取管理员密钥
    const ADMIN_TOKEN = env.ADMIN_TOKEN || '';
    const ADMIN_USERNAME = env.ADMIN_USERNAME || 'admin';
    const ADMIN_PASSWORD = env.ADMIN_PASSWORD || '';

    // 如果未设置任何密钥，拒绝访问（安全起见）
    if (!ADMIN_TOKEN && !ADMIN_PASSWORD) {
        console.warn('⚠️ 未配置管理员凭据，拒绝访问');
        return false;
    }

    // 方式1: Bearer Token 验证
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        if (token === ADMIN_TOKEN) {
            return true;
        }
    }

    // 方式2: Basic Auth 验证
    if (authHeader && authHeader.startsWith('Basic ')) {
        const base64Credentials = authHeader.substring(6);
        const credentials = atob(base64Credentials);
        const [username, password] = credentials.split(':');
        
        if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
            return true;
        }
    }

    // 方式3: URL 参数验证（用于浏览器快速访问）
    const url = new URL(request.url);
    const tokenParam = url.searchParams.get('token');
    if (tokenParam === ADMIN_TOKEN) {
        return true;
    }

    return false;
}

/**
 * 返回 401 未授权响应
 */
export function unauthorizedResponse() {
    return new Response(
        JSON.stringify({
            error: 'Unauthorized',
            message: '需要管理员权限。请在请求头中提供 Authorization: Bearer <token> 或设置环境变量 ADMIN_TOKEN',
            hint: '也可以通过 ?token=YOUR_TOKEN 访问'
        }),
        {
            status: 401,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'WWW-Authenticate': 'Basic realm="WorkerRSS Admin"'
            }
        }
    );
}

/**
 * 生成随机 Token（用于初始化）
 */
export function generateToken(length = 32) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < length; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
}
