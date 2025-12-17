import { fetchWithHeaders } from './fetcher.js';

/**
 * Translate items using an external API.
 * @param {Array} items - List of feed items.
 * @param {Object} config - Route configuration (contains translation settings).
 * @param {Object} globalSettings - Global admin settings (contains API keys).
 * @returns {Promise<Array>} - List of items with translated content.
 */
export async function translateItems(items, config, globalSettings, logger = console) {
    if (!items || items.length === 0) return items;
    if (!config || !config.translation || !config.translation.enabled) return items;

    // Normalize logger
    const log = typeof logger === 'function' ? logger : (logger.log?.bind(logger) || console.log);
    const warn = (logger.warn?.bind(logger)) || ((msg) => log(`[WARN] ${msg}`));
    const error = (logger.error?.bind(logger)) || ((msg) => log(`[ERROR] ${msg}`));

    // Check global settings for provider (support both nested and legacy flat format)
    const provider = globalSettings?.translation?.provider || globalSettings?.transProvider; // 'openai', 'deepl', 'custom', 'google'
    const apiUrl = globalSettings?.translation?.apiUrl || globalSettings?.transEndpoint;
    const apiKey = globalSettings?.translation?.apiKey || globalSettings?.transKey;
    const model = globalSettings?.translation?.model || globalSettings?.transModel || 'gpt-3.5-turbo';

    // Google Translate (Free) does not need API key
    if (provider !== 'google' && (!apiUrl || !apiKey)) {
        warn('[Translator] Missing global translation API configuration. Please save settings in Admin Panel.');
        return items;
    }

    const targetLang = config.translation.targetLang || 'zh';
    const sourceLang = config.translation.sourceLang || 'auto';

    log(`[Translator] Translating ${items.length} items to ${targetLang} using ${provider || 'custom'}`);

    // Limit concurrency
    const CONCURRENCY = 3;
    const results = [];

    for (let i = 0; i < items.length; i += CONCURRENCY) {
        const chunk = items.slice(i, i + CONCURRENCY);
        const promises = chunk.map(item => translateSingleItem(item, targetLang, sourceLang, { provider, apiUrl, apiKey, model }, { log, warn, error }, config));
        const translatedChunk = await Promise.all(promises);
        results.push(...translatedChunk);
    }

    return results;
}


export async function translateSingleItem(item, targetLang, sourceLang, settings, logger, config) {
    // Dispatch to Google Logic if provider is google
    if (settings.provider === 'google') {
        return translateGoogleFree(item, targetLang, sourceLang, logger, config);
    }

    // Clone item to avoid mutating original if needed
    const newItem = { ...item };
    const { log, error } = logger;

    try {
        const title = newItem.title || '';
        const desc = newItem.description || '';

        if (!title && !desc) return newItem;

        const contentToTranslate = `Title: ${title}\n\nDescription: ${desc}`;

        const systemPrompt = `You are a professional translator. Translate the following RSS feed item to ${targetLang}. 
Preserve the original formatting, HTML tags, and structure exactly. 
Return the result in the format:
Title: [Translated Title]

Description: [Translated Description]
`;

        const payload = {
            model: settings.model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: contentToTranslate }
            ],
            temperature: 0.3
        };

        const resp = await fetchWithHeaders(settings.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.apiKey}`
            },
            body: JSON.stringify(payload)
        });

        if (!resp.ok) {
            const err = await resp.text();
            throw new Error(`API Error ${resp.status}: ${err}`);
        }

        const data = await resp.json();
        const translatedText = data.choices?.[0]?.message?.content || '';

        // Extract Title and Description
        const titleMatch = translatedText.match(/Title:\s*(.*?)(?:\n\n|\nDescription:|$)/s);
        const descMatch = translatedText.match(/Description:\s*(.*)$/s);

        if (titleMatch && titleMatch[1]) newItem.title = titleMatch[1].trim();
        if (descMatch && descMatch[1]) newItem.description = descMatch[1].trim();

        // Mark as translated
        newItem.isTranslated = true;

    } catch (e) {
        error(`[Translator] Failed to translate item: ${item.title.substring(0, 20)}... ${e.message}`);
    }

    return newItem;
}

/**
 * Translate an item using unofficial Google Translate API
 * Endpoint: https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl={source}&tl={target}&q={text}
 */
async function translateGoogleFree(item, targetLang, sourceLang = 'auto', logger, config) {
    const newItem = { ...item };
    const { error } = logger || console; // Fallback just in case

    // New options
    const scope = config?.translation?.scope || 'both'; // 'both', 'title', 'desc'
    const format = config?.translation?.format || 'replace'; // 'replace', 'append', 'prepend'

    const title = newItem.title || '';
    const desc = newItem.description || '';

    if (!title && !desc) return newItem;

    // Helper to call google api
    const callGoogle = async (text) => {
        if (!text) return '';
        // Use 'gtx' client which is widely used for free access
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=${sourceLang}&tl=${targetLang}&q=${encodeURIComponent(text)}`;
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        if (!res.ok) throw new Error(`Google API ${res.status}`);
        const data = await res.json();
        // Structure: [[["translated", "original", ...], ["translated", "original", ...]], ...]
        // Join all parts
        if (Array.isArray(data) && Array.isArray(data[0])) {
            return data[0].map(part => part[0]).join('');
        }
        return text;
    };

    try {
        // --- Translate Title ---
        if (title && (scope === 'both' || scope === 'title')) {
            const transTitle = await callGoogle(title);
            if (transTitle) {
                if (format === 'append') {
                    newItem.title = `${title} (${transTitle})`;
                } else if (format === 'prepend') {
                    newItem.title = `${transTitle} (${title})`;
                } else {
                    newItem.title = transTitle;
                }
            }
        }

        // --- Translate Description ---
        if (desc && (scope === 'both' || scope === 'desc')) {
            const transDesc = await callGoogle(desc);
            if (transDesc) {
                if (format === 'append') {
                    newItem.description = `${desc}<br/><hr/><br/>${transDesc}`;
                } else if (format === 'prepend') {
                    newItem.description = `${transDesc}<br/><hr/><br/>${desc}`;
                } else {
                    newItem.description = transDesc;
                }
            }
        }

        newItem.isTranslated = true;
    } catch (e) {
        if (error) error(`[Translator] Google logic failed for ${title.substring(0, 10)}: ${e.message}`);
        else console.error(e);
    }

    return newItem;
}
