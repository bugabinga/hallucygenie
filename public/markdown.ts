import { marked } from "marked";

// Configure: GFM, synchronous
marked.use({
    gfm: true,
    async: false,
    breaks: false,
});

// Link: open in new tab, noopener for security
marked.use({
    renderer: {
        link({ href, title, text }: { href: string; title?: string | null; text: string }) {
            const titleAttr = title ? ` title="${title}"` : "";
            return `<a href="${href}"${titleAttr} target="_blank" rel="noopener">${text}</a>`;
        },
        // Code block: use `lang-` class prefix for CSS compatibility
        code({ text, lang }: { text: string; lang?: string }) {
            const cls = lang ? ` class="lang-${lang}"` : "";
            const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            return `<pre><code${cls}>${escaped}</code></pre>`;
        },
        // Preserve task list checkbox class for CSS styling
        listitem({ text, task, checked }: { text: string; task?: boolean; checked?: boolean }) {
            if (task) {
                const cls = checked ? "task-checkbox task-checked" : "task-checkbox";
                return `<li><input type="checkbox" disabled class="${cls}"${checked ? " checked" : ""}> ${text}</li>\n`;
            }
            return `<li>${text}</li>\n`;
        },
    },
});

export function renderMarkdown(text: string): string {
    return marked.parse(text) as string;
}
