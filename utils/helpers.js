import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import jschardet from 'jschardet';

/**
 * Get value from object by path (supports nested paths, arrays, wildcards)
 * @param {object} obj 
 * @param {string} path 
 * @returns {any}
 */
export function getVal(obj, path) {
    if (!path) return '';
    if (path === '.') return obj; // Return whole object
    
    try {
        // Split path, support . and [] syntax
        // e.g. "items[0].title" -> ["items", "0", "title"]
        const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
        let current = obj;
        
        for (const part of parts) {
            if (!part) continue;
            
            // Handle array index
            if (!isNaN(part)) {
                current = current[parseInt(part)];
            } else {
                current = current[part];
            }
            
            if (current === undefined || current === null) return '';
        }
        
        return current;
    } catch (e) {
        return '';
    }
}

/**
 * Convert Cheerio Element to JSON
 * @param {cheerio.Cheerio} $ 
 * @param {cheerio.Element} element 
 * @returns {any}
 */
function elementToJson($, element) {
    const obj = {};
    const $el = $(element);
    
    // Attributes
    const attribs = element.attribs;
    if (attribs) {
        for (const key in attribs) {
            obj['@' + key] = attribs[key];
        }
    }
    
    // Children
    const children = $el.children();
    if (children.length === 0) {
        const text = $el.text();
        // If no attributes, return text directly? 
        // No, consistency is better. But for simple tags <title>Text</title>, {title: "Text"} is nicer.
        if (Object.keys(obj).length === 0) return text;
        obj['#text'] = text;
        return obj;
    }
    
    children.each((i, child) => {
        const childName = child.tagName; // tagName is available in cheerio element
        const childJson = elementToJson($, child);
        
        if (obj[childName]) {
            if (!Array.isArray(obj[childName])) {
                obj[childName] = [obj[childName]];
            }
            obj[childName].push(childJson);
        } else {
            obj[childName] = childJson;
        }
    });
    
    return obj;
}

/**
 * Parse XML string to JSON object using Cheerio
 * @param {string} xml 
 * @returns {object}
 */
export function xmlToJson(xml) {
    const $ = cheerio.load(xml, { xmlMode: true });
    const root = $.root().children().first();
    if (root.length === 0) return {};
    
    const result = {};
    result[root[0].tagName] = elementToJson($, root[0]);
    return result;
}

/**
 * Decode response buffer to text with specified encoding
 * @param {Response} response 
 * @param {string} encoding 
 * @returns {Promise<string>}
 */
export async function decodeText(response, encoding) {
    // If encoding is explicitly provided and is not 'auto', use it directly
    if (encoding && encoding !== 'auto' && encoding !== 'utf-8') {
        try {
            const buf = await response.clone().arrayBuffer();
            const u8 = new Uint8Array(buf);
            const enc = normalizeCharset(encoding);
            // Try TextDecoder first for common encodings
            try {
                const decoder = new TextDecoder(enc);
                return decoder.decode(u8);
            } catch (e) {
                // Fallback to iconv-lite
                try {
                    return iconv.decode(u8, enc);
                } catch (e2) {
                    console.error(`iconv decode failed for ${enc}:`, e2);
                    return new TextDecoder('utf-8').decode(u8);
                }
            }
        } catch (e) {
            console.error(`Encoding error with ${encoding}, fallback to UTF-8:`, e);
            try {
                const buffer = await response.clone().arrayBuffer();
                return new TextDecoder('utf-8').decode(buffer);
            } catch (e2) {
                return await response.clone().text();
            }
        }
    }

    // Auto-detect charset from Content-Type header or from meta tags in HTML
    try {
        const cloned = response.clone();
        const contentType = cloned.headers.get('content-type') || '';
        const charsetMatch = contentType.match(/charset=\s*([^;\s]+)/i);
            if (charsetMatch && charsetMatch[1]) {
            const charsetRaw = charsetMatch[1];
            const charset = normalizeCharset(charsetRaw);
            try {
                const buffer = await cloned.arrayBuffer();
                const u8 = new Uint8Array(buffer);
                // Try TextDecoder first
                try {
                    return new TextDecoder(charset).decode(u8);
                } catch (e) {
                    // Use iconv-lite fallback
                    try {
                        return iconv.decode(u8, charset);
                    } catch (e2) {
                        console.warn('Failed to decode with charset from header:', charset, e2);
                    }
                }
            } catch (e) {
                console.warn('Error reading buffer for charset decoding:', e);
            }
        }

        // Read a portion of the body to search for <meta charset> or <meta http-equiv> declarations
        const probeResp = response.clone();
        const buf = await probeResp.arrayBuffer();
        const probeLen = Math.min(buf.byteLength, 8192);
        const probeSlice = buf.slice(0, probeLen);
        // Try decoding as utf-8 first for meta sniffing
        let snippet = '';
        try {
            snippet = new TextDecoder('utf-8', { fatal: false }).decode(probeSlice);
        } catch (e) {
            snippet = '';
        }

        // Search for <meta charset="..."> or <meta http-equiv="Content-Type" content="text/html; charset=...">
        const metaMatch = snippet.match(/<meta[^>]+charset=["']?([^"'\s/>]+)/i) || snippet.match(/<meta[^>]+content=["'][^"']*charset=([^"'\s/>]+)/i);
        if (metaMatch && metaMatch[1]) {
            const metaCharsetRaw = metaMatch[1];
            const metaCharset = normalizeCharset(metaCharsetRaw);
            try {
                const u8 = new Uint8Array(buf);
                try {
                    return new TextDecoder(metaCharset).decode(u8);
                } catch (e) {
                    try {
                        return iconv.decode(u8, metaCharset);
                    } catch (e2) {
                        console.warn('Failed to decode with meta charset:', metaCharset, e2);
                    }
                }
            } catch (e) {
                console.warn('Meta charset decode error:', e);
            }
        }

        // If still unknown, try heuristic detection with jschardet
        try {
            const u8full = new Uint8Array(buf);
            const detectRes = jschardet.detect(u8full);
            if (detectRes && detectRes.encoding && detectRes.confidence > 0.4) {
                const guessed = normalizeCharset(detectRes.encoding);
                try {
                    return iconv.decode(u8full, guessed);
                } catch (e) {
                    console.warn('jschardet guess decode failed:', guessed, e);
                }
            }
        } catch (e) {
            console.warn('Charset detection failed:', e);
        }

        // Default fallback: let platform handle it (text())
        return await response.clone().text();
    } catch (e) {
        try {
            return await response.clone().text();
        } catch (e2) {
            console.error('Failed to decode response body:', e2);
            return '';
        }
    }
}
