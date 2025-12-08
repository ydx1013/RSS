import * as cheerio from 'cheerio';

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
    if (!encoding || encoding === 'auto' || encoding === 'utf-8') {
        return await response.text();
    }
    
    try {
        const buffer = await response.arrayBuffer();
        const decoder = new TextDecoder(encoding);
        return decoder.decode(buffer);
    } catch (e) {
        console.error(`Encoding error with ${encoding}, fallback to UTF-8:`, e);
        // If arrayBuffer() was called, we can't call text() on the same response object unless we cloned it.
        // But here we are inside catch block of arrayBuffer or TextDecoder.
        // If arrayBuffer failed, we can't do much.
        // If TextDecoder failed, we have the buffer.
        return new TextDecoder('utf-8').decode(buffer); 
    }
}
