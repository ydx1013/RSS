
/**
 * Enhanced fetch wrapper with browser-like headers to avoid anti-bot detection.
 * @param {string} url 
 * @param {object} options 
 * @returns {Promise<Response>}
 */
export async function fetchWithHeaders(url, options = {}) {
    const defaultHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'DNT': '1',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
    };

    // Merge headers
    const headers = { ...defaultHeaders, ...(options.headers || {}) };

    // If Referer is not set, maybe set it to the origin of the url?
    // Some sites check Referer. But setting it to self might be safer or leaving it empty.
    // Let's leave it empty unless specified.

    const newOptions = {
        ...options,
        headers: headers,
        // redirect: 'follow' // Default is follow
    };

    return fetch(url, newOptions);
}
