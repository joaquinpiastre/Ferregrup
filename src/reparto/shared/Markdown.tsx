import type { ReactNode } from 'react';

// Markdown básico para las respuestas de la IA: títulos, listas, tablas, negrita, cursiva y
// código. Todo se arma con elementos de React (nunca HTML crudo), así que no hay inyección.

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith('**')) out.push(<strong key={key} style={{ color: '#fff' }}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) out.push(<code key={key} style={{ background: '#262626', padding: '1px 5px', borderRadius: 4, fontSize: '0.9em' }}>{tok.slice(1, -1)}</code>);
    else out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const isTableSep = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

export default function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = `b${k++}`;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.trim().startsWith('```')) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) body.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={key} style={{ background: '#0f0f0f', border: '1px solid #2d2d2d', borderRadius: 8, padding: 10, overflowX: 'auto', fontSize: 12, margin: '6px 0' }}>
          {body.join('\n')}
        </pre>
      );
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const size = [17, 15, 14, 13][heading[1].length - 1];
      blocks.push(<div key={key} style={{ fontSize: size, fontWeight: 700, color: '#fff', margin: '10px 0 4px' }}>{inline(heading[2], key)}</div>);
      i++;
      continue;
    }
    if (line.trim().startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]));
      blocks.push(
        <div key={key} className="table-wrap" style={{ margin: '6px 0', border: '1px solid #2d2d2d', borderRadius: 8 }}>
          <table style={{ fontSize: 12 }}>
            <thead><tr>{head.map((h, j) => <th key={j}>{inline(h, `${key}h${j}`)}</th>)}</tr></thead>
            <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j}>{inline(c, `${key}r${ri}c${j}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      continue;
    }
    const bullet = /^\s*([-*•]|\d+[.)])\s+/;
    if (bullet.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items: string[] = [];
      while (i < lines.length && bullet.test(lines[i])) items.push(lines[i++].replace(bullet, ''));
      const style = { margin: '4px 0', paddingLeft: 20 };
      const lis = items.map((it, j) => <li key={j} style={{ margin: '2px 0' }}>{inline(it, `${key}l${j}`)}</li>);
      blocks.push(ordered ? <ol key={key} style={{ ...style, listStyle: 'decimal' }}>{lis}</ol> : <ul key={key} style={{ ...style, listStyle: 'disc' }}>{lis}</ul>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !bullet.test(lines[i]) && !/^#{1,4}\s/.test(lines[i]) && !lines[i].trim().startsWith('```') && !(lines[i].trim().startsWith('|') && isTableSep(lines[i + 1] ?? ''))) {
      para.push(lines[i++]);
    }
    blocks.push(
      <p key={key} style={{ margin: '4px 0' }}>
        {para.flatMap((p, j) => (j ? [<br key={`${key}br${j}`} />, ...inline(p, `${key}p${j}`)] : inline(p, `${key}p${j}`)))}
      </p>
    );
  }
  return <div style={{ fontSize: 14, lineHeight: 1.55, color: '#e5e5e5', overflowWrap: 'anywhere' }}>{blocks}</div>;
}
