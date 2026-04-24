#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import JSZip from "jszip";           // ← replaces AdmZip; JSZip preserves entry order
import hljs from "highlight.js";    // ← clean static import, same as React script

/**
 * Angular Docs EPUB Generator
 *
 * Synchronized with @generateReactDotDevLearnEpub.mjs methodology.
 * Features inline style conversion and strict XHTML compliance for Foliate.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = __dirname;
const CONTENT_DIR = path.join(projectRoot, "adev/src/content");
const ASSETS_DIR = path.join(projectRoot, "adev/src/assets");

// Global map to track used images and their EPUB paths
const imageManifest = new Map();

marked.setOptions({ breaks: true, gfm: true });

// ─── Syntax colour map (identical to React script) ───────────────────────────
const SYNTAX_COLORS = {
  "hljs-keyword":          "color: #c678dd;",
  "hljs-title":            "color: #61afef;",
  "hljs-title.function_":  "color: #61afef;",
  "hljs-function":         "color: #61afef;",
  "hljs-string":           "color: #98c379;",
  "hljs-number":           "color: #d19a66;",
  "hljs-literal":          "color: #56b6c2;",
  "hljs-attr":             "color: #d19a66;",
  "hljs-attribute":        "color: #d19a66;",
  "hljs-name":             "color: #383838;",
  "hljs-tag":              "color: #e45649;",
  "hljs-comment":          "color: #928374;",
  "hljs-meta":             "color: #928374;",
  "hljs-symbol":           "color: #61afef;",
  "hljs-built_in":         "color: #56b6c2;",
  "hljs-variable":         "color: #383838;",
  "hljs-type":             "color: #e45649;",
  "hljs-params":           "color: #383838;",
  "hljs-property":         "color: #d19a66;",
  "hljs-key":              "color: #d19a66;",
  "hljs-value":            "color: #98c379;",
  "hljs-number.integer":   "color: #d19a66;",
  "hljs-string.double":    "color: #98c379;",
  "hljs-template-variable":"color: #e45649;",
  "hljs-doctag":           "color: #928374;",
  "hljs-punctuation":      "color: #383838;",
  "hljs-selector-class":   "color: #d19a66;",
  "hljs-selector-tag":     "color: #e45649;",
  "language-xml":          "color: #383838;",
  "language-xquery":       "color: #383838;",
};

function convertHighlightToInlineStyles(html) {
  let result = html;
  Object.entries(SYNTAX_COLORS).forEach(([className, style]) => {
    result = result.replace(
      new RegExp(`<span class="${className}">`, "g"),
      `<span style="${style}">`
    );
  });
  result = result.replace(/<span class="([^"]*)">/g, (match, classes) => {
    for (const cls of classes.split(" ")) {
      const s = SYNTAX_COLORS[`hljs-${cls}`] || SYNTAX_COLORS[cls];
      if (s) return `<span style="${s}">`;
    }
    return "<span>";
  });
  return result;
}

function escapeXml(unsafe) {
  return unsafe.replace(/[<>&"']/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
      case "'": return '&apos;';
      default: return c;
    }
  });
}

/** Highlights technical terms (functions, decorators, hooks) in HTML text nodes or code blocks */
function highlightTechnicalContent(html) {
  let h = html;
  // Decorators: @Component
  h = h.replace(/(@[a-zA-Z_$][a-zA-Z0-9_$]*)/g, '<span style="color: #e45649;">$1</span>');
  // Function calls: name() or name(args)
  h = h.replace(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)(?=\s*\()/g, '<span style="color: #61afef;">$1</span>');
  // Lifecycle hooks (even without parens)
  const hooks = 'ngOnInit|ngOnChanges|ngOnDestroy|ngDoCheck|ngAfterViewInit|ngAfterViewChecked|ngAfterContentInit|ngAfterContentChecked';
  h = h.replace(new RegExp(`\\b(${hooks})\\b`, 'g'), '<span style="color: #61afef;">$1</span>');
  return h;
}

/** Safely highlights terms in prose without touching HTML tags */
function highlightProse(html) {
  const parts = html.split(/(<[^>]+>)/);
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) { // Text node
      // Only highlight very specific patterns in prose to avoid false positives:
      // 1. name()
      parts[i] = parts[i].replace(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\(\)/g, '<span style="color: #61afef;">$1</span>()');
      // 2. Lifecycle hooks
      const hooks = 'ngOnInit|ngOnChanges|ngOnDestroy|ngDoCheck|ngAfterViewInit|ngAfterViewChecked|ngAfterContentInit|ngAfterContentChecked';
      parts[i] = parts[i].replace(new RegExp(`\\b(${hooks})\\b`, 'g'), '<span style="color: #61afef;">$1</span>');
    }
  }
  return parts.join('');
}

// ─── XHTML sanitiser ─────────────────────────────────────────────────────────
// Foliate parses EPUB pages as strict XML. Two classes of HTML5 constructs
// break the parser, causing the entire page to go blank:
//   1. Void elements without self-closing slash:  <br>  <img ...>  <input>
//   2. Boolean attributes with no value:          <a download href="…">
//   3. Unescaped ampersands:                      & instead of &amp;
function sanitiseXhtml(html) {
  // 1. Process images: catch both markdown-generated and raw HTML img tags
  html = html.replace(/<img\s+([^>]*src="([^"]+)"[^>]*)>/gi, (match, fullAttrs, src) => {
    // We only handle local assets (assets/images/...)
    if (src.startsWith('assets/images/')) {
      const cleanSrc = src.split('#')[0].split('?')[0]; // Remove fragment/query
      // The markdown uses 'assets/images/foo.png', which lives in 'adev/src/assets/images/foo.png'
      // ASSETS_DIR is already 'adev/src/assets', so we need to remove the leading 'assets/' from cleanSrc
      const subPath = cleanSrc.replace(/^assets\//, '');
      const fsPath = path.join(ASSETS_DIR, subPath);
      const epubPath = `assets/${cleanSrc.replace(/\//g, '_')}`;
      
      imageManifest.set(epubPath, fsPath);
      
      // Update the src to be relative to the OEBPS root in the EPUB
      return `<img ${fullAttrs.replace(src, epubPath)}/>`;
    }
    return match;
  });

  // 2. Self-close void elements
  html = html.replace(
    /<(br|hr|img|input|area|base|col|embed|param|source|track|wbr)(\s[^>]*)?>(?!\/)/gi,
    (_, tag, attrs) => `<${tag}${attrs || ""}/>`
  );
  // Boolean attributes → attr=""
  html = html.replace(
    /(<\w[^>]*\s)(allowfullscreen|async|autofocus|autoplay|checked|controls|default|defer|disabled|download|formnovalidate|hidden|ismap|loop|multiple|muted|nomodule|novalidate|open|readonly|required|reversed|selected)(\s|>)/gi,
    (_, pre, attr, post) => `${pre}${attr}=""${post}`
  );
  // Escape & that are not part of an entity
  html = html.replace(/&(?!(?:[a-z0-9]+|#[0-9]+|#x[a-f0-9]+);)/gi, '&amp;');
  
  // Highlight content inside <code> tags (handles both codespan and raw HTML code tags)
  html = html.replace(/<code>([^<]+)<\/code>/g, (_, content) => `<code>${highlightTechnicalContent(content)}</code>`);

  return highlightProse(html);
}

// ─── Marked renderer ─────────────────────────────────────────────────────────
const renderer = new marked.Renderer();

// FIX: marked passes a token *object* to codespan in some versions;
// coerce to string and ESCAPE for XML/XHTML.
renderer.codespan = (code) => {
  const text = typeof code === "object" ? (code.text ?? String(code)) : code;
  // Content will be highlighted by sanitiseXhtml since it wraps it in <code>
  return `<code>${escapeXml(text)}</code>`;
};

renderer.code = ({ text, language }) => {
  let highlighted = text;
  let lang = (language || "").split(" ")[0].replace(/\{.*\}/, "").toLowerCase();
  const langMap = { "angular-ts": "typescript", "angular-html": "xml", "typescript": "typescript" };
  lang = langMap[lang] || lang;

  try {
    highlighted = lang && hljs.getLanguage(lang)
      ? hljs.highlight(text, { language: lang }).value
      : hljs.highlightAuto(text).value;
  } catch (_) {
    highlighted = text;
  }

  highlighted = convertHighlightToInlineStyles(highlighted);

  // Angular decorators / control-flow  (@Component, @if, …)
  highlighted = highlighted.replace(
    /(^|[\s\(\[\{])(@[a-zA-Z_$][a-zA-Z0-9_$]*)/g,
    '$1<span style="color: #e45649;">$2</span>'
  );
  // Object property keys
  highlighted = highlighted.replace(
    /(\s+)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*):/g,
    '$1<span style="color: #d19a66;">$2</span>$3:'
  );
  // Angular template bindings  [prop]  (event)  [(model)]  *directive
  highlighted = highlighted.replace(
    /([\s])(\[[\w.\-]+\]|\([\w.\-]+\)|\[\([\w.\-]+\)\]|\*[\w\-]+)(?=[=\s>])/g,
    '$1<span style="color: #d19a66;">$2</span>'
  );
  // Strip any remaining non-span tags (identical to React script)
  highlighted = highlighted.replace(/<(?!span|\/span)[^>]+>/g, "");

  return `<div style="display: block; page-break-inside: avoid; break-inside: avoid; -webkit-column-break-inside: avoid; margin-bottom: 1rem;"><pre style="margin: 0; background: #f5f5f5; padding: 0.75rem; border-radius: 6px; border-left: 4px solid #0066cc; border-top: 1px solid #ddd; border-right: 1px solid #ddd; border-bottom: 1px solid #ddd; line-height: 1.4; overflow-x: auto;"><code>${highlighted}</code></pre></div>`;
};

// Void elements must be self-closing in XHTML
renderer.br    = () => `<br/>`;
renderer.hr    = () => `<hr/>`;
renderer.image = ({ href, title, text }) =>
  `<img src="${href}" alt="${text || ""}"${title ? ` title="${title}"` : ""}/>`;

// Raw HTML blocks that slip through from .md source
renderer.html = ({ text }) => sanitiseXhtml(text);

marked.setOptions({ renderer });

// ─── Stylesheet ───────────────────────────────────────────────────────────────
const EPUB_STYLESHEET = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Menlo", "Monaco", "Courier New", monospace; line-height: 1.6; color: #222; background: #fff; font-size: 1rem; padding: 1rem; }
h1, h2, h3, h4 { margin-top: 1.5rem; margin-bottom: 0.5rem; font-weight: 600; line-height: 1.2; color: #1976d2; }
h1 { font-size: 2em; margin-top: 2rem; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
h2 { font-size: 1.5em; }
h3 { font-size: 1.25em; }
p { margin-bottom: 1rem; }
code { background: #f0f0f0; padding: 0.2em 0.4em; border-radius: 3px; font-family: "Menlo", "Monaco", "Courier New", monospace; font-size: 0.9em; color: #d63384; }

pre { background: #f5f5f5; padding: 0.75rem; border-radius: 6px; overflow-x: auto; margin: 0; border-left: 4px solid #0066cc; border-top: 1px solid #ddd; border-right: 1px solid #ddd; border-bottom: 1px solid #ddd; line-height: 1.4; display: block; }
pre code { background: none; padding: 0; font-size: 0.85em; color: #222; border-radius: 0; font-family: "Menlo", "Monaco", "Courier New", monospace; line-height: 1.4; display: block; white-space: pre-wrap; }
blockquote { border-left: 4px solid #ddd; padding-left: 1rem; margin-left: 0; margin-bottom: 1rem; color: #666; }
ul, ol { margin-left: 2rem; margin-bottom: 1rem; }
li { margin-bottom: 0.5rem; }
a { color: #0066cc; text-decoration: none; }
img { max-width: 100%; height: auto; margin: 1rem 0; }

/* Syntax highlighting colors - Dark Mode support */
@media (prefers-color-scheme: dark) {
  body { background: #1e1e1e; color: #e0e0e0; }
  h1, h2, h3, h4 { color: #61afef; }
  code { background: #333; color: #ef9a9a; }
  pre { background: #2d2d2d; border-color: #444; }
  pre code { color: #e0e0e0; }
  blockquote { color: #aaa; border-left-color: #555; }
  a { color: #61afef; }
  
  /* Map One Dark Light to One Dark Dark approx */
  span[style*="color: #c678dd"] { color: #d89bef !important; } /* keyword */
  span[style*="color: #61afef"] { color: #7ec8ff !important; } /* title */
  span[style*="color: #98c379"] { color: #b5e089 !important; } /* string */
  span[style*="color: #d19a66"] { color: #e5a76f !important; } /* number/attr */
  span[style*="color: #56b6c2"] { color: #7ec8ff !important; } /* built_in */
  span[style*="color: #e45649"] { color: #ff9080 !important; } /* tag/type */
  span[style*="color: #928374"] { color: #a8a8a8 !important; } /* comment */
  span[style*="color: #383838"] { color: #abb2bf !important; } /* punctuation/name */
}
`;

// ─── Angular-specific content processing ─────────────────────────────────────
function processAngularAlerts(content) {
  const ALERT_MAP = { TIP: "💡 Tip", NOTE: "📝 Note", IMPORTANT: "⚠️ Important", CRITICAL: "🚨 Critical", HELPFUL: "ℹ️ Helpful" };
  return content.replace(/^([A-Z\d\s.]+): (.*?)(?:\n{2,}|\s*$)/gm, (match, type, body) => {
    const title = ALERT_MAP[type.trim()];
    return title
      ? `<aside style="background: #f9f9f9; padding: 1rem; margin: 1rem 0; border-left: 4px solid #ccc; border-radius: 5px;"><strong>${title}:</strong> ${body.trim()}</aside>\n\n`
      : match;
  });
}

function processAngularTags(content) {
  let p = content;
  // Pre-escape <project-name> placeholders that are likely to break XHTML
  p = p.replace(/<project-name>/g, "&lt;project-name&gt;");

  p = p.replace(/<docs-callout([^>]*)>((?:.(?!\/docs-callout))*)<\/docs-callout>/gs, (_, attrs, body) => {
    const titleMatch = attrs.match(/title="([^"]*)"/);
    const color = attrs.includes("critical") ? "#f44336" : attrs.includes("important") ? "#ff9800" : "#0066cc";
    return `<aside style="border: 1px solid #ddd; padding: 1rem; margin: 1rem 0; border-radius: 5px; border-left: 4px solid ${color}; background: #f0f8ff;"><h3>${titleMatch ? escapeXml(titleMatch[1]) : "Callout"}</h3>${marked.parse(body.trim(), { renderer })}</aside>`;
  });
  p = p.replace(/<docs-decorative-header([^>]*)>(.*?)<\/docs-decorative-header>/gs, (_, attrs, body) => {
    const inner = body.trim();
    if (!inner) return "";
    return `<header style="text-align: center; margin-bottom: 2rem; padding: 1rem; background: #f0f8ff; border-radius: 5px; border-left: 4px solid #0066cc;">${marked.parse(inner, { renderer })}</header>`;
  });
  p = p.replace(/<docs-code([^>]*)>(.*?)<\/docs-code>/gs, (_, attrs, body) => {
    const langMatch = attrs.match(/language="([^"]*)"/);
    return renderer.code({ text: body.trim(), language: langMatch ? langMatch[1] : "typescript" });
  });
  return p.replace(/<docs-[a-z-]+[^>]*>/g, "").replace(/<\/docs-[a-z-]+>/g, "");
}

function extractTitle(content, relPath) {
  const headerMatch = content.match(/<docs-decorative-header[^>]*title="([^"]*)"/);
  if (headerMatch) return headerMatch[1];
  const h1Match = content.match(/^# (.*)$/m);
  if (h1Match) return h1Match[1];
  const last = relPath.split("/").pop().replace(".md", "");
  return last.charAt(0).toUpperCase() + last.slice(1).replace(/-/g, " ");
}

async function collectFiles() {
  const files = [];
  async function walk(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const res = path.resolve(dir, entry.name);
      if (entry.isDirectory()) await walk(res);
      else if (entry.name.endsWith(".md") && !entry.name.includes("BUILD.bazel") && entry.name !== "error.md" && entry.name !== "kitchen-sink.md")
        files.push({ fullPath: res, relPath: path.relative(CONTENT_DIR, res) });
    }
  }
  await walk(CONTENT_DIR);
  return files.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🚀 Generating Angular Docs EPUB...");

  const files = await collectFiles();
  console.log(`📂 Found ${files.length} markdown files`);

  const documents = [];
  for (const file of files) {
    const content = await fs.readFile(file.fullPath, "utf-8");
    const title = extractTitle(content, file.relPath);
    let markdown = content
      .replace(/^---[\s\S]*?---/, "")
      .replace(/<!-- markdownlint-disable-line -->/g, "");

    // Remove only the first top-level Markdown header (# Title) to avoid duplication
    // with the chapter title we add in the template.
    markdown = markdown.replace(/^#\s+.*$/m, "");

    markdown = processAngularAlerts(markdown);
    markdown = processAngularTags(markdown);
    // Parse with custom renderer, then run XHTML sanitiser over the full output
    const html = sanitiseXhtml(marked.parse(markdown, { renderer }));
    const epubName = file.relPath.replace(/\//g, "_").replace(".md", ".html");
    documents.push({ relPath: file.relPath, title, html, epubName });
    process.stdout.write(`\r  ${documents.length}/${files.length} ${title.substring(0, 50)}`);
  }
  console.log("\n✓ All documents processed");

  // ── Build ZIP with JSZip ───────────────────────────────────────────────────
  // CRITICAL: "mimetype" must be the very first entry in the zip file.
  // AdmZip sorts entries alphabetically (META-INF/ comes before mimetype),
  // which causes Foliate to reject the entire EPUB. JSZip preserves insertion order.
  const zip = new JSZip();

  // 1. mimetype — MUST be first entry per EPUB spec
  zip.file("mimetype", "application/epub+zip");

  // 2. META-INF
  zip.folder("META-INF").file("container.xml", `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

  // 3. OEBPS
  const oebps = zip.folder("OEBPS");
  oebps.file("style.css", EPUB_STYLESHEET);

  // Build hierarchical NCX/nav tree
  const root = { children: {}, title: "Angular Documentation" };
  documents.forEach(doc => {
    const parts = doc.relPath.split("/");
    let cur = root;
    parts.forEach((part, i) => {
      if (i === parts.length - 1) cur.children[part] = doc;
      else {
        if (!cur.children[part])
          cur.children[part] = { children: {}, title: part.charAt(0).toUpperCase() + part.slice(1).replace(/-/g, " ") };
        cur = cur.children[part];
      }
    });
  });

  const findFirstDoc = node => node.epubName
    ? node.epubName
    : findFirstDoc(Object.values(node.children).sort((a, b) =>
        (a.relPath || a.title || "").localeCompare(b.relPath || b.title || ""))[0]);

  let playOrder = 1;
  const buildNcx = node => Object.keys(node.children).sort().map(key => {
    const child = node.children[key];
    if (child.relPath)
      return `<navPoint id="np-${playOrder}" playOrder="${playOrder++}"><navLabel><text>${escapeXml(child.title)}</text></navLabel><content src="${child.epubName}"/></navPoint>`;
    return `<navPoint id="np-${playOrder}" playOrder="${playOrder++}"><navLabel><text>${escapeXml(child.title)}</text></navLabel><content src="${findFirstDoc(child)}"/>${buildNcx(child)}</navPoint>`;
  }).join("");

  oebps.file("toc.ncx", `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="ang-${Date.now()}"/>
    <meta name="dtb:depth" content="4"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>Angular Docs</text></docTitle>
  <navMap>${buildNcx(root)}</navMap>
</ncx>`);

  const buildNav = node => "<ul>" + Object.keys(node.children).sort().map(key => {
    const child = node.children[key];
    return child.relPath
      ? `<li><a href="${child.epubName}">${escapeXml(child.title)}</a></li>`
      : `<li><span>${escapeXml(child.title)}</span>${buildNav(child)}</li>`;
  }).join("") + "</ul>";

  oebps.file("nav.xhtml", `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head><title>Navigation</title></head>
<body><nav epub:type="toc"><h1>Table of Contents</h1>${buildNav(root)}</nav></body>
</html>`);

  // Chapter files + manifest/spine
  const manifestItems = [
    '<item id="nav"   href="nav.xhtml"  media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="ncx"   href="toc.ncx"    media-type="application/x-dtbncx+xml"/>',
    '<item id="style" href="style.css"  media-type="text/css"/>',
  ];

  // 4. Bundle Images
  const assetsFolder = oebps.folder("assets");
  for (const [epubPath, fsPath] of imageManifest.entries()) {
    try {
      const data = await fs.readFile(fsPath);
      const fileName = epubPath.split('/').pop();
      assetsFolder.file(fileName, data);
      
      const ext = path.extname(fsPath).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.gif' ? 'image/gif' : ext === '.svg' ? 'image/svg+xml' : 'application/octet-stream';
      
      manifestItems.push(`<item id="img_${manifestItems.length}" href="${epubPath}" media-type="${mime}"/>`);
    } catch (e) {
      console.warn(`\n⚠️ Could not find image: ${fsPath}`);
    }
  }

  const spineItems = [];

  documents.forEach((doc, i) => {
    oebps.file(doc.epubName, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${doc.title}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <div class="chapter">
    <h1>${doc.title}</h1>
    ${doc.html}
  </div>
</body>
</html>`);
    manifestItems.push(`<item id="item_${i}" href="${doc.epubName}" media-type="application/xhtml+xml"/>`);
    spineItems.push(`<itemref idref="item_${i}"/>`);
  });

  oebps.file("content.opf", `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="uid">ang-${Date.now()}</dc:identifier>
    <dc:title>Angular Documentation</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    ${manifestItems.join("\n    ")}
  </manifest>
  <spine toc="ncx">
    ${spineItems.join("\n    ")}
  </spine>
</package>`);

  const outputPath = path.join(projectRoot, "angular-docs.epub");
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  await fs.writeFile(outputPath, buffer);

  const mb = (buffer.length / 1024 / 1024).toFixed(2);
  console.log(`\n✅ EPUB generated: ${outputPath} (${mb} MB, ${documents.length} chapters)`);
}

main().catch(err => { console.error("❌", err); process.exit(1); });
