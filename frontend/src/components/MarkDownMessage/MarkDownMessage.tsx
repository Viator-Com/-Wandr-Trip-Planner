import React from "react";

/* ─────────────────────────────────────────────────────────
   Inline parser  — bold, code, link, bare-url, image
───────────────────────────────────────────────────────── */
function parseInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern =
    /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)|\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s,)>"]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));

    if (m[1] !== undefined) {
      // ![alt](url)
      nodes.push(
        <span key={m.index} className="md-img-wrapper">
          <img
            src={m[2]}
            alt={m[1] || "image"}
            className="md-img"
            onError={(e) => {
              (
                e.currentTarget as HTMLImageElement
              ).parentElement!.style.display = "none";
            }}
          />
          {m[1] && <span className="md-img-caption">{m[1]}</span>}
        </span>,
      );
    } else if (m[3] !== undefined) {
      nodes.push(<strong key={m.index}>{m[3]}</strong>);
    } else if (m[4] !== undefined) {
      nodes.push(
        <code key={m.index} className="md-code">
          {m[4]}
        </code>,
      );
    } else if (m[5] !== undefined) {
      nodes.push(
        <a
          key={m.index}
          href={m[6]}
          target="_blank"
          rel="noopener noreferrer"
          className="md-link"
        >
          {m[5]}
        </a>,
      );
    } else if (m[7]) {
      nodes.push(
        <a
          key={m.index}
          href={m[7]}
          target="_blank"
          rel="noopener noreferrer"
          className="md-link"
        >
          {m[7]}
        </a>,
      );
    }

    last = pattern.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/* ─────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────── */
function isLocationLine(line: string) {
  const t = line.replace(/^[-–*\s]+/, "").trim();
  return /\*{0,2}location\*{0,2}/i.test(t) || /coordinates?/i.test(t);
}

function stripItemPrefix(raw: string): string {
  return (
    raw
      .trim()
      // numbered prefix  "1. "  "1) "
      .replace(/^\d+[.)]\s+/, "")
      // circled unicode numbers ①②③ … the AI sometimes emits these literally
      .replace(/^[\u2460-\u2473\u24F5-\u24FE\u2776-\u277F\u24EB-\u24F4]\s*/, "")
      // surrounding bold markers
      .replace(/^\*\*(.+)\*\*$/, "$1")
      .trim()
  );
}

/* ─────────────────────────────────────────────────────────
   Main renderer
───────────────────────────────────────────────────────── */
export default function MarkdownMessage({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const t = raw.trim();

    /* blank line */
    if (!t) {
      i++;
      continue;
    }

    /* horizontal rule */
    if (/^(-{3,}|_{3,}|\*{3,})$/.test(t)) {
      elements.push(<hr key={i} className="md-hr" />);
      i++;
      continue;
    }

    /* fenced code block */
    if (t.startsWith("```")) {
      const lang = t.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      elements.push(
        <pre key={i} className="md-pre">
          {lang && <span className="md-code-lang">{lang}</span>}
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    /* headings */
    const hm = t.match(/^(#{1,3})\s+(.+)/);
    if (hm) {
      const level = hm[1].length;
      const text = hm[2].replace(/\*\*/g, "").trim();
      const cls = ["md-h1", "md-h2", "md-h3"][level - 1];
      const Tag = (["h1", "h2", "h3"] as const)[level - 1];
      elements.push(
        <Tag key={i} className={cls}>
          {parseInline(text)}
        </Tag>,
      );
      i++;
      continue;
    }

    /* ── ordered list ── */
    if (/^\d+[.)]\s/.test(t) || /^[\u2460-\u2473]\s*\S/.test(t)) {
      const items: React.ReactNode[] = [];

      while (i < lines.length) {
        const lt = lines[i].trim();
        // stop if line is not a list item
        if (!/^\d+[.)]\s/.test(lt) && !/^[\u2460-\u2473]/.test(lt)) break;

        const labelRaw = stripItemPrefix(lt);
        i++;

        /* collect indented sub-lines */
        const subItems: React.ReactNode[] = [];
        while (i < lines.length) {
          const sub = lines[i].trim();
          if (!sub) {
            i++;
            continue;
          }
          // next numbered item → stop
          if (/^\d+[.)]\s/.test(sub) || /^[\u2460-\u2473]/.test(sub)) break;
          // deeper heading → stop
          if (/^#{1,3}\s/.test(sub)) break;

          const isIndented =
            lines[i].startsWith("   ") || lines[i].startsWith("\t");
          const isBullet = /^\s*[-–*•]\s/.test(lines[i]);

          if (!isIndented && !isBullet) break;

          i++;
          if (isLocationLine(sub)) continue;

          const subText = sub.replace(/^[-–*•]\s+/, "").trim();
          if (!subText) continue;

          // image inside sub-item
          const imgM = subText.match(/^!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)$/);
          if (imgM) {
            subItems.push(
              <span key={i} className="md-img-wrapper">
                <img
                  src={imgM[2]}
                  alt={imgM[1] || "image"}
                  className="md-img"
                  onError={(e) => {
                    (
                      e.currentTarget as HTMLImageElement
                    ).parentElement!.style.display = "none";
                  }}
                />
                {imgM[1] && <span className="md-img-caption">{imgM[1]}</span>}
              </span>,
            );
            continue;
          }

          subItems.push(
            <li key={i} className="md-sub-item">
              <span>{parseInline(subText)}</span>
            </li>,
          );
        }

        items.push(
          <li key={i} className="md-list-item">
            {/* number circle comes from CSS ::before counter — no JSX number here */}
            <div className="md-list-content">
              <span className="md-list-label">{parseInline(labelRaw)}</span>
              {subItems.length > 0 && (
                <ul className="md-sub-list">{subItems}</ul>
              )}
            </div>
          </li>,
        );
      }

      if (items.length > 0)
        elements.push(
          <ol key={`ol-${i}`} className="md-ol">
            {items}
          </ol>,
        );
      continue;
    }

    /* ── unordered list ── */
    if (/^[-*•]\s/.test(t)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^[-*•]\s/.test(lines[i].trim())) {
        const sub = lines[i].trim().replace(/^[-*•]\s+/, "");
        i++;
        if (isLocationLine(sub)) continue;
        items.push(
          <li key={i} className="md-sub-item">
            <span>{parseInline(sub)}</span>
          </li>,
        );
      }
      if (items.length > 0)
        elements.push(
          <ul key={`ul-${i}`} className="md-ul">
            {items}
          </ul>,
        );
      continue;
    }

    /* skip raw location / coordinate lines */
    if (isLocationLine(t)) {
      i++;
      continue;
    }

    /* paragraph — absorb consecutive plain lines */
    const paraLines: string[] = [t];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^#{1,6}\s/.test(lines[i].trim()) &&
      !/^[-*•]\s/.test(lines[i].trim()) &&
      !/^\d+[.)]\s/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith("```") &&
      !/^(-{3,}|_{3,}|\*{3,})$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    elements.push(
      <p key={i} className="md-p">
        {parseInline(paraLines.join(" "))}
      </p>,
    );
  }

  return <div className="md-body">{elements}</div>;
}
