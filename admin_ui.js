import html from './admin.html';
import css from './admin_style.css';
import js from './admin_script.js.txt';

export const adminHtml = html
    .replace('<!-- CSS_INJECT_POINT -->', `<style>${css}</style>`)
    .replace('<!-- JS_INJECT_POINT -->', `<script>${js}</script>`);
