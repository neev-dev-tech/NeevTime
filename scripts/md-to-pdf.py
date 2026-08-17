#!/usr/bin/env python3
"""
Render a Markdown document to a print-ready PDF.

    python3 scripts/md-to-pdf.py docs/ROADMAP.md out/NeevTime-Roadmap.pdf

Exists because the previous roadmap and market-readiness PDFs were produced by
hand and could not be regenerated when the content changed — so the documents
drifted from what the repository actually said. Both are now Markdown in docs/,
which reviews in a diff, and this turns either into a PDF in one command.

No dependencies. There is no Markdown library on this machine and adding one to
a project that does not otherwise need Python is not worth it, so this handles
the subset those documents use: headings, paragraphs, lists, tables, rules,
inline bold/italic/code. It is not a general Markdown implementation and does
not pretend to be — anything it does not recognise passes through as a
paragraph, which is visible rather than silently dropped.

Headless Chrome does the printing.
"""

import html
import re
import subprocess
import sys
from pathlib import Path

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

CSS = """
@page { size: A4; margin: 18mm 16mm; }
* { box-sizing: border-box; }
body {
    font: 10.5pt/1.55 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
    color: #1a1a1a; margin: 0;
}
h1 { font-size: 23pt; margin: 0 0 2mm; letter-spacing: -0.4pt; }
h2 {
    font-size: 14pt; margin: 9mm 0 3mm; padding-bottom: 1.5mm;
    border-bottom: 1.5pt solid #d97706; page-break-after: avoid;
}
h3 { font-size: 11.5pt; margin: 6mm 0 2mm; page-break-after: avoid; }
p { margin: 0 0 3mm; }
ul, ol { margin: 0 0 3mm; padding-left: 5mm; }
li { margin-bottom: 1.5mm; }
hr { border: 0; border-top: 0.5pt solid #d4d4d4; margin: 7mm 0; }
code {
    font: 9.5pt ui-monospace, "SF Mono", Menlo, monospace;
    background: #f4f4f5; padding: 0.4mm 1.2mm; border-radius: 1mm;
}
em { color: #52525b; }
pre {
    background: #f8f8f9; border: 0.5pt solid #e4e4e7; border-radius: 1.5mm;
    padding: 2.5mm 3mm; margin: 0 0 3.5mm; overflow-x: auto;
    page-break-inside: avoid;
}
pre code {
    background: none; padding: 0; font-size: 8.5pt; line-height: 1.45;
    white-space: pre-wrap; word-break: break-all;
}
table {
    border-collapse: collapse; width: 100%; margin: 0 0 4mm;
    font-size: 9pt; page-break-inside: avoid;
}
th {
    text-align: left; background: #fafafa; border-bottom: 1pt solid #a1a1aa;
    padding: 1.6mm 2mm; font-weight: 600;
}
td { border-bottom: 0.5pt solid #e4e4e7; padding: 1.6mm 2mm; vertical-align: top; }
/* Status words carry the meaning of the table; make them readable at a glance
   without colour being the only signal. */
td strong { font-weight: 700; }
"""

INLINE = (
    # The text is already escaped by inline() before these run. Escaping again
    # here turned <bucket> into the literal text &lt;bucket&gt; on the page.
    (re.compile(r"`([^`]+)`"), lambda m: f"<code>{m.group(1)}</code>"),
    (re.compile(r"\*\*([^*]+)\*\*"), lambda m: f"<strong>{m.group(1)}</strong>"),
    (re.compile(r"(?<!\*)\*([^*]+)\*(?!\*)"), lambda m: f"<em>{m.group(1)}</em>"),
)


def inline(text):
    text = html.escape(text)
    # Unescape only what the inline patterns need to match on.
    text = text.replace("&quot;", '"').replace("&#x27;", "'")
    for pattern, repl in INLINE:
        text = pattern.sub(repl, text)
    return text


def convert(md):
    out, lines, i = [], md.split("\n"), 0

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if stripped.startswith("```"):
            # Fenced block. Without this the fences printed literally and every
            # multi-line command collapsed into one run-on paragraph — in a
            # document that is mostly commands, which made it unusable.
            i += 1
            body = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                body.append(html.escape(lines[i]))
                i += 1
            i += 1        # closing fence
            out.append("<pre><code>" + "\n".join(body) + "</code></pre>")
        elif not stripped:
            i += 1
        elif stripped.startswith("---") and set(stripped) == {"-"}:
            out.append("<hr>")
            i += 1
        elif stripped.startswith("#"):
            level = len(stripped) - len(stripped.lstrip("#"))
            out.append(f"<h{level}>{inline(stripped[level:].strip())}</h{level}>")
            i += 1
        elif stripped.startswith("|"):
            # A table: header, separator, then rows until the block ends.
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            if len(rows) >= 2:
                head, body = rows[0], rows[2:]      # rows[1] is the --- separator
                out.append("<table><thead><tr>"
                           + "".join(f"<th>{inline(c)}</th>" for c in head)
                           + "</tr></thead><tbody>")
                for row in body:
                    out.append("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in row) + "</tr>")
                out.append("</tbody></table>")
        elif stripped.startswith("- "):
            out.append("<ul>")
            while i < len(lines) and lines[i].strip().startswith("- "):
                out.append(f"<li>{inline(lines[i].strip()[2:])}</li>")
                i += 1
            out.append("</ul>")
        elif re.match(r"^\d+\.\s", stripped):
            out.append("<ol>")
            while i < len(lines) and re.match(r"^\d+\.\s", lines[i].strip()):
                text = re.sub(r"^\d+\.\s+", "", lines[i].strip())
                out.append(f"<li>{inline(text)}</li>")
                i += 1
            out.append("</ol>")
        else:
            para = []
            while i < len(lines) and lines[i].strip() and not re.match(
                    r"^\s*(#|\||- |\d+\.\s|---\s*$)", lines[i]):
                para.append(lines[i].strip())
                i += 1
            out.append(f"<p>{inline(' '.join(para))}</p>")

    return "\n".join(out)


def main():
    if len(sys.argv) != 3:
        sys.exit("usage: md-to-pdf.py <input.md> <output.pdf>")

    src, dest = Path(sys.argv[1]), Path(sys.argv[2])
    if not src.exists():
        sys.exit(f"no such file: {src}")
    if not Path(CHROME).exists():
        sys.exit(f"Chrome not found at {CHROME} — needed to print the PDF")

    dest.parent.mkdir(parents=True, exist_ok=True)
    page = (f"<!doctype html><html><head><meta charset='utf-8'>"
            f"<title>{html.escape(src.stem)}</title><style>{CSS}</style></head>"
            f"<body>{convert(src.read_text())}</body></html>")

    tmp = dest.with_suffix(".html")
    tmp.write_text(page)

    subprocess.run(
        [CHROME, "--headless", "--disable-gpu", "--no-pdf-header-footer",
         f"--print-to-pdf={dest}", tmp.resolve().as_uri()],
        check=True, capture_output=True, timeout=120,
    )
    tmp.unlink()

    if not dest.exists() or dest.stat().st_size < 1000:
        sys.exit("Chrome produced no usable PDF")
    print(f"{dest}  ({dest.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
