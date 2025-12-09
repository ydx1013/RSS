
/**
 * Send a notification via Bark
 * @param {string} barkUrl The Bark server URL (e.g. https://api.day.app/KEY/)
 * @param {string} title Notification title
 * @param {string} body Notification body
 * @param {string} group Notification group (optional)
 * @param {string} url Click URL (optional)
 */
export async function sendBarkNotification(barkUrl, title, body, group = 'RSS-Worker', url = '') {
    if (!barkUrl) return;

    // Basic validation
    if (!/^https?:\/\//i.test(barkUrl)) {
        console.error('Invalid Bark URL (must start with http:// or https://):', barkUrl);
        return;
    }

    // Ensure barkUrl ends with /
    if (!barkUrl.endsWith('/')) barkUrl += '/';

    // Prepare common params
    const icon = 'https://cdn-icons-png.flaticon.com/512/3670/3670157.png';
    const safeTitle = String(title || '').slice(0, 2000);
    const safeBody = String(body || '').slice(0, 16000);

    // Try GET first for short payloads (Bark commonly supports GET path), fallback to POST
    const tryGet = safeBody.length < 1000; // heuristic

    try {
        if (tryGet) {
            // Construct GET URL: barkUrl + title/body in path, with query for extras
            const encodedTitle = encodeURIComponent(safeTitle || 'Notification');
            const encodedBody = encodeURIComponent(safeBody || '');
            const params = new URLSearchParams();
            if (group) params.set('group', group);
            if (icon) params.set('icon', icon);
            if (url) params.set('url', url);

            const getUrl = barkUrl + encodedTitle + '/' + encodedBody + (params.toString() ? ('?' + params.toString()) : '');

            const resp = await fetch(getUrl, { method: 'GET' });
            if (resp.ok) return true; // success
            // If GET failed due to length or service, fall through to POST
            const text = await resp.text().catch(() => '');
            console.warn('Bark GET failed, falling back to POST. status=', resp.status, 'body=', text);
        }

        // POST payload
        const payload = {
            title: safeTitle,
            body: safeBody,
            group,
            url,
            icon
        };

        const postResp = await fetch(barkUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8'
            },
            body: JSON.stringify(payload)
        });

        if (!postResp.ok) {
            const respText = await postResp.text().catch(() => '');
            console.error('Bark POST failed:', postResp.status, respText);
            return false;
        }

        return true;

    } catch (e) {
        console.error('Failed to send Bark notification:', e);
        return false;
    }
}
