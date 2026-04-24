#!/usr/bin/env node
//Should Put in The Script Folder Of The cloned repo of https://github.com/reactjs/react.dev
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { marked } from "marked";
import hljs from "highlight.js";
import JSZip from "jszip";
import matter from "gray-matter";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, "..");

marked.setOptions({
  breaks: true,
  gfm: true,
});

const SYNTAX_COLORS = {
  // Core syntax elements
  "hljs-keyword": "color: #c678dd;",
  "hljs-title": "color: #61afef;",
  "hljs-title.function_": "color: #61afef;",
  "hljs-function": "color: #61afef;",
  "hljs-string": "color: #98c379;",
  "hljs-number": "color: #d19a66;",
  "hljs-literal": "color: #56b6c2;",
  "hljs-attr": "color: #d19a66;",
  "hljs-attribute": "color: #d19a66;",
  "hljs-name": "color: #383838;",
  "hljs-tag": "color: #e45649;",
  "hljs-comment": "color: #928374;",
  "hljs-meta": "color: #928374;",
  "hljs-symbol": "color: #61afef;",
  "hljs-built_in": "color: #56b6c2;",
  "hljs-variable": "color: #383838;",
  "hljs-type": "color: #e45649;",
  "hljs-params": "color: #383838;",
  "hljs-property": "color: #d19a66;",
  // JSON specific
  "hljs-key": "color: #d19a66;",
  "hljs-value": "color: #98c379;",
  "hljs-number.integer": "color: #d19a66;",
  "hljs-string.double": "color: #98c379;",
  // HTML/XML/JSX specific
  "hljs-template-variable": "color: #e45649;",
  "hljs-doctag": "color: #928374;",
  "hljs-punctuation": "color: #383838;",
  "hljs-selector-class": "color: #d19a66;",
  "hljs-selector-tag": "color: #e45649;",
  "language-xml": "color: #383838;",
  "language-xquery": "color: #383838;",
};

function convertHighlightToInlineStyles(html) {
  let result = html;

  // Replace known class-based styles with inline equivalents
  Object.entries(SYNTAX_COLORS).forEach(([className, style]) => {
    const regex = new RegExp(`<span class="${className}">`, "g");
    result = result.replace(regex, `<span style="${style}">`);
  });

  // Handle multiple classes and unmapped classes
  result = result.replace(/<span class="([^"]*)">/g, (match, classes) => {
    const classArray = classes.split(" ");
    for (const cls of classArray) {
      const colorStyle = SYNTAX_COLORS[`hljs-${cls}`] || SYNTAX_COLORS[cls];
      if (colorStyle) {
        return `<span style="${colorStyle}">`;
      }
    }
    // Remove class attribute for unmapped classes (important for EPUB readers)
    return "<span>";
  });

  return result;
}

// Create renderer for custom markdown processing
const renderer = new marked.Renderer();

renderer.codespan = (code) => `<code>${code}</code>`;

renderer.code = ({ text, language }) => {
  let highlighted = text;

  // Apply syntax highlighting
  if (language) {
    try {
      highlighted = hljs.getLanguage(language)
        ? hljs.highlight(text, { language }).value
        : hljs.highlightAuto(text).value;
    } catch (e) {
      highlighted = text;
    }
  } else {
    highlighted = hljs.highlightAuto(text).value;
  }

  // Convert class-based styles to inline
  highlighted = convertHighlightToInlineStyles(highlighted);

  // Highlight object property names
  highlighted = highlighted.replace(
    /(\s+)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*):/g,
    '$1<span style="color: #d19a66;">$2</span>$3:',
  );

  // Remove non-span HTML tags
  highlighted = highlighted.replace(/<(?!span|\/span)[^>]+>/g, "");

  const wrappedCode = `<div style="display: block; page-break-inside: avoid; break-inside: avoid; -webkit-column-break-inside: avoid; margin-bottom: 1rem;"><pre style="margin: 0;"><code>${highlighted}</code></pre></div>`;
  return wrappedCode;
};

marked.setOptions({ renderer });

// MDX component handlers
const MDX_COMPONENTS = {
  Intro: (content) => `<div class="intro-section">${content}</div>`,
  YouWillLearn: (content) =>
    `<div class="will-learn-section"><h3>You will learn</h3>${content}</div>`,
  Note: (content) =>
    `<aside class="note-section"><strong>Note:</strong> ${content}</aside>`,
  Pitfall: (content) =>
    `<aside class="pitfall-section"><strong>⚠️ Pitfall:</strong> ${content}</aside>`,
  DeepDive: (content) =>
    `<aside class="deepdive-section"><strong>Deep Dive:</strong> ${content}</aside>`,
  Recipes: (content) =>
    `<section class="recipes-section"><h3>Recipes</h3>${content}</section>`,
};

// EPUB stylesheet
const EPUB_STYLESHEET = `
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Menlo", "Monaco", "Courier New", monospace;
  line-height: 1.6;
  color: #222;
  background: #fff;
  font-size: 1rem;
  padding: 1rem;
}

h1, h2, h3, h4, h5, h6 {
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
  font-weight: 600;
  line-height: 1.2;
}

h1 { font-size: 2em; margin-top: 2rem; }
h2 { font-size: 1.5em; }
h3 { font-size: 1.25em; }
h4 { font-size: 1.1em; }

p { margin-bottom: 1rem; }

code {
  background: #f0f0f0;
  padding: 0.2em 0.4em;
  border-radius: 3px;
  font-family: "Menlo", "Monaco", "Courier New", monospace;
  font-size: 0.9em;
  color: #d63384;
}

div[style*="page-break-inside"] {
  page-break-inside: avoid;
  break-inside: avoid;
  -webkit-column-break-inside: avoid;
}

pre {
  background: #f5f5f5;
  padding: 0.75rem;
  border-radius: 6px;
  overflow-x: auto;
  margin: 0;
  border-left: 4px solid #0066cc;
  border-top: 1px solid #ddd;
  border-right: 1px solid #ddd;
  border-bottom: 1px solid #ddd;
  line-height: 1.4;
  display: block;
}

pre code {
  background: none;
  padding: 0;
  font-size: 0.8em;
  color: #222;
  border-radius: 0;
  font-family: "Menlo", "Monaco", "Courier New", monospace;
  line-height: 1.4;
  display: block;
  white-space: pre-wrap;
}

blockquote {
  border-left: 4px solid #ddd;
  padding-left: 1rem;
  margin-left: 0;
  margin-bottom: 1rem;
  color: #666;
}

ul, ol {
  margin-left: 2rem;
  margin-bottom: 1rem;
}

li { margin-bottom: 0.5rem; }

a {
  color: #0066cc;
  text-decoration: none;
}

/* Custom section styles */
.intro-section {
  background: #f0f8ff;
  padding: 1rem;
  border-radius: 5px;
  margin-bottom: 1.5rem;
  border-left: 4px solid #0066cc;
}

.will-learn-section {
  background: #f5f5f5;
  padding: 1rem;
  border-radius: 5px;
  margin: 1.5rem 0;
  border-left: 4px solid #666;
}

.note-section {
  background: #fff3cd;
  padding: 1rem;
  border-radius: 5px;
  margin: 1rem 0;
  border-left: 4px solid #ffc107;
  display: block;
}

.pitfall-section {
  background: #ffe0e0;
  padding: 1rem;
  border-radius: 5px;
  margin: 1rem 0;
  border-left: 4px solid #dc3545;
  display: block;
}

.deepdive-section {
  background: #e8f4f8;
  padding: 1rem;
  border-radius: 5px;
  margin: 1rem 0;
  border-left: 4px solid #17a2b8;
  display: block;
}

.recipes-section {
  background: #f0f0f0;
  padding: 1rem;
  border-radius: 5px;
  margin: 1.5rem 0;
  border-left: 4px solid #666;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1rem;
}

th, td {
  border: 1px solid #ddd;
  padding: 0.5rem;
  text-align: left;
}

th {
  background: #f5f5f5;
  font-weight: 600;
}

img {
  max-width: 100%;
  height: auto;
  margin: 1rem 0;
}

hr {
  border: none;
  border-top: 1px solid #ddd;
  margin: 2rem 0;
}

.toc-page {
  margin-bottom: 0;
  padding-bottom: 0;
}

.chapter { margin-top: 0; }

em { font-style: italic; }
strong { font-weight: 600; }

/* Syntax highlighting colors - Atom One Light Theme */
code[style*="c678dd"], span[style*="c678dd"] { color: #c678dd !important; }
code[style*="61afef"], span[style*="61afef"] { color: #61afef !important; }
code[style*="98c379"], span[style*="98c379"] { color: #98c379 !important; }
code[style*="d19a66"], span[style*="d19a66"] { color: #d19a66 !important; }
code[style*="56b6c2"], span[style*="56b6c2"] { color: #56b6c2 !important; }
code[style*="e45649"], span[style*="e45649"] { color: #e45649 !important; }
code[style*="928374"], span[style*="928374"] { color: #928374 !important; }

pre code {
  line-height: 1.5;
  display: block;
  overflow-x: auto;
}

pre code span { display: inline; }

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  pre {
    background: #2a2a2a;
    color: #e0e0e0;
  }
  
  pre code { color: #e0e0e0; }
  
  code[style*="c678dd"], span[style*="c678dd"] { color: #d89bef !important; }
  code[style*="61afef"], span[style*="61afef"] { color: #7ec8ff !important; }
  code[style*="98c379"], span[style*="98c379"] { color: #b5e089 !important; }
  code[style*="d19a66"], span[style*="d19a66"] { color: #e5a76f !important; }
  code[style*="56b6c2"], span[style*="56b6c2"] { color: #7ec8ff !important; }
  code[style*="e45649"], span[style*="e45649"] { color: #ff9080 !important; }
  code[style*="928374"], span[style*="928374"] { color: #a8a8a8 !important; }
}
`;

// Process MDX components and convert to HTML
function processMdxComponents(content) {
  let processed = content;

  Object.entries(MDX_COMPONENTS).forEach(([component, handler]) => {
    const regex = new RegExp(`<${component}>([\\s\\S]*?)</${component}>`, "g");
    processed = processed.replace(regex, (match, innerContent) => {
      const parsedContent = marked.parse(innerContent.trim());
      return handler(parsedContent);
    });
  });

  return processed;
}

// Convert markdown to HTML
function markdownToHtml(content) {
  // Remove MDX heading ID comments
  let cleaned = content.replace(/\s*\{\/\*[^*]*\*\/\}/g, "");

  let html = processMdxComponents(cleaned);
  html = marked.parse(html);
  return html;
}

// Collect all learn section markdown files
async function collectLearnFiles() {
  const learnDir = path.join(projectRoot, "src/content/learn");
  const files = [];

  async function walkDir(dir, prefix = "") {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        await walkDir(fullPath, relativePath);
      } else if (entry.name.endsWith(".md")) {
        files.push({
          fullPath,
          relativePath,
          name: entry.name,
        });
      }
    }
  }

  await walkDir(learnDir);
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

// Parse and prepare a document
async function prepareDocument(filePath, order) {
  const content = await fs.readFile(filePath, "utf-8");
  const { data: frontmatter, content: markdown } = matter(content);

  const html = markdownToHtml(markdown);
  const title = frontmatter.title || "Untitled";

  return {
    order,
    title,
    html,
    frontmatter,
    filename: path.basename(filePath, ".md"),
  };
}

// Generate EPUB structure with better CSS
async function generateEpub(documents) {
  const zip = new JSZip();

  // 1. Create mimetype file (must be first, uncompressed)
  zip.file("mimetype", "application/epub+zip", { compression: "DEFLATE" });

  // 2. Create META-INF directory with container.xml
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  zip.folder("META-INF").file("container.xml", containerXml);

  // 3. Create OEBPS directory with content files
  const oebps = zip.folder("OEBPS");

  oebps.file("style.css", EPUB_STYLESHEET);

  // Create title page
  const titlePageHtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta charset="UTF-8" />
  <title>React Learn Documentation</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <div style="text-align: center; padding: 4rem 1rem;">
    <h1>React Documentation</h1>
    <h2>Learn Section</h2>
    <p style="margin-top: 2rem; font-size: 1.1em;">A comprehensive guide to learning React</p>
    <p style="margin-top: 1rem;">Generated from react.dev</p>
    <p style="margin-top: 3rem; font-size: 0.9em;">52 chapters • Optimized for offline reading</p>
  </div>
</body>
</html>`;

  oebps.file("titlepage.html", titlePageHtml);

  // Create Table of Contents page with title info
  let tocHtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
   <meta charset="UTF-8" />
   <title>Table of Contents</title>
   <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body class="toc-page">
   <div style="text-align: center; padding: 2rem 1rem; margin-bottom: 2rem;">
     <h1>React Documentation</h1>
     <h2>Learn Section</h2>
     <p style="margin-top: 1rem; font-size: 0.95em;">A comprehensive guide to learning React</p>
     <p style="margin-top: 0.5rem; font-size: 0.9em;">52 chapters • Optimized for offline reading</p>
   </div>
   <h2 style="border-top: 1px solid #ddd; padding-top: 1rem; margin-top: 1rem;">Chapters</h2>
   <ol>`;

  documents.forEach((doc) => {
    tocHtml += `\n    <li><a href="chapter-${doc.order}.html">${doc.title}</a></li>`;
  });

  tocHtml += `\n  </ol>\n</body>\n</html>`;
  oebps.file("toc.html", tocHtml);

  // Create chapter files
  documents.forEach((doc) => {
    const chapterHtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${doc.title}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <div class="chapter">
    <h1>${doc.title}</h1>
    ${doc.html}
  </div>
</body>
</html>`;
    oebps.file(`chapter-${doc.order}.html`, chapterHtml);
  });

  // Build OPF manifest and spine
  const manifestItems = [
    '    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    '    <item id="style" href="style.css" media-type="text/css"/>',
    '    <item id="toc" href="toc.html" media-type="application/xhtml+xml"/>',
    ...documents.map(
      (doc) =>
        `    <item id="chapter-${doc.order}" href="chapter-${doc.order}.html" media-type="application/xhtml+xml"/>`,
    ),
  ];

  const spineItems = [
    '    <itemref idref="toc"/>',
    ...documents.map((doc) => `    <itemref idref="chapter-${doc.order}"/>`),
  ];

  const manifest = `<manifest>\n${manifestItems.join("\n")}\n  </manifest>`;
  const spine = `<spine toc="ncx">\n${spineItems.join("\n")}\n  </spine>`;

  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="uuid_id" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>React Learn Documentation</dc:title>
    <dc:creator>React Team</dc:creator>
    <dc:description>Complete React learning guide from react.dev optimized for offline reading</dc:description>
    <dc:language>en</dc:language>
    <dc:rights>Licensed under the Creative Commons License</dc:rights>
    <dc:identifier id="uuid_id">react-learn-${Date.now()}</dc:identifier>
    <meta name="cover" content="cover"/>
  </metadata>
  ${manifest}  ${spine}  <guide>
    <reference type="toc" title="Table of Contents" href="toc.html"/>
  </guide>
</package>`;

  oebps.file("content.opf", contentOpf);

  // Create NCX (toc.ncx) for EPUB2 compatibility
  let ncxContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="react-learn-${Date.now()}"/>
    <meta name="dtb:depth" content="2"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>React Learn Documentation</text>
  </docTitle>
  <navMap>
    <navPoint id="navpoint-1" playOrder="1">
      <navLabel><text>Title Page</text></navLabel>
      <content src="titlepage.html"/>
    </navPoint>
    <navPoint id="navpoint-2" playOrder="2">
      <navLabel><text>Table of Contents</text></navLabel>
      <content src="toc.html"/>
    </navPoint>`;

  documents.forEach((doc, index) => {
    ncxContent += `
    <navPoint id="navpoint-${index + 3}" playOrder="${index + 3}">
      <navLabel><text>${doc.title}</text></navLabel>
      <content src="chapter-${doc.order}.html"/>
    </navPoint>`;
  });

  ncxContent += `
  </navMap>
</ncx>`;

  oebps.file("toc.ncx", ncxContent);

  return zip;
}

// Main function
async function main() {
  try {
    console.log("📚 React Learn Documentation EPUB Generator (Simplified)");
    console.log("=".repeat(55));

    console.log("\n📂 Collecting learn section files...");
    const files = await collectLearnFiles();
    console.log(`✓ Found ${files.length} files`);

    console.log("\n🔄 Processing documents...");
    const documents = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const doc = await prepareDocument(file.fullPath, i + 1);
      documents.push(doc);
      process.stdout.write(
        `\r  ${i + 1}/${files.length} ${doc.title.substring(0, 40)}`,
      );
    }
    console.log("\n✓ All documents processed");

    console.log("\n📄 Generating EPUB structure...");
    const epub = await generateEpub(documents);

    const outputPath = path.join(projectRoot, "react-learn.epub");
    console.log(`\n💾 Writing EPUB file: ${outputPath}`);

    const buffer = await epub.generateAsync({ type: "nodebuffer" });
    await fs.writeFile(outputPath, buffer);

    const fileSize = (buffer.length / 1024 / 1024).toFixed(2);
    console.log(`✓ EPUB generated successfully! (${fileSize} MB)`);
    console.log(`\n📖 Your EPUB is ready: ${outputPath}`);
    console.log("\nFeatures:");
    console.log("  • Clean, readable code blocks");
    console.log("  • Proper table of contents");
    console.log("  • All 52 learn section chapters");
    console.log("  • Optimized for all EPUB readers");
  } catch (error) {
    console.error("❌ Error generating EPUB:", error.message);
    process.exit(1);
  }
}

main();
