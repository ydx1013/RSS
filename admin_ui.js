import html from './admin.html';
import css from './admin_style.css';

// Import all admin source modules
import js00 from './admin_src/00_header.js.txt';
import js01 from './admin_src/01_api.js.txt';
import js02 from './admin_src/02_nav.js.txt';
import js03 from './admin_src/03_ui_folders.js.txt';
import js04 from './admin_src/04_settings.js.txt';
import js05 from './admin_src/05_ui_routes.js.txt';
import js06 from './admin_src/06_ui_editor.js.txt';
import js07 from './admin_src/07_ui_filter.js.txt';
import js08 from './admin_src/08_ui_tokens.js.txt';
import js09 from './admin_src/09_visual_selector.js.txt';
import js10 from './admin_src/10_dashboard.js.txt';
import js11 from './admin_src/11_init.js.txt';

const js = [
    js00, js01, js02, js03, js04, js05,
    js06, js07, js08, js09, js10, js11
].join('\n\n');

export const adminHtml = html
    .replace('<!-- CSS_INJECT_POINT -->', `<style>${css}</style>`)
    .replace('<!-- JS_INJECT_POINT -->', `<script>${js}</script>`);
