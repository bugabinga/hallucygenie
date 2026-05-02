import { marked } from "marked";

// Configure: GFM, synchronous
marked.use({
    gfm: true,
    async: false,
    breaks: false,
});

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;");
}

function normalizeMarkdownInput(text: string): string {
    return text
        .replace(/\r\n/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

// Link: open in new tab, noopener for security
marked.use({
    renderer: {
        link({ href, title, text }: { href: string; title?: string | null; text: string }) {
            const safeHref = escapeHtml(href);
            const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
            return `<a href="${safeHref}"${titleAttr} target="_blank" rel="noopener">${text}</a>`;
        },
        image({ href, title, text }: { href: string; title?: string | null; text: string }) {
            const safeHref = escapeHtml(href);
            const safeAlt = escapeHtml(text || "Generated image");
            const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
            return `<img class="markdown-image" src="${safeHref}" alt="${safeAlt}"${titleAttr} loading="lazy" referrerpolicy="no-referrer">`;
        },
        html({ text }: { text: string }) {
            return escapeHtml(text);
        },
        // Code block: use `lang-` class prefix for CSS compatibility
        code({ text, lang }: { text: string; lang?: string }) {
            const cls = lang ? ` class="lang-${lang}"` : "";
            const escaped = escapeHtml(text);
            return `<pre><code${cls}>${escaped}</code></pre>`;
        },
        // Preserve task list checkbox class for CSS styling
        listitem({ text, task, checked }: { text: string; task?: boolean; checked?: boolean }) {
            const rendered = marked.parseInline(text) as string;
            if (task) {
                const cls = checked ? "task-checkbox task-checked" : "task-checkbox";
                return `<li><input type="checkbox" disabled class="${cls}"${checked ? " checked" : ""}> ${rendered}</li>\n`;
            }
            return `<li>${rendered}</li>\n`;
        },
    },
});

export function renderMarkdown(text: string): string {
    return marked.parse(normalizeMarkdownInput(text)) as string;
}
