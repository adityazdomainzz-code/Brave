import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

type Token = { kind: "plain" | "kw" | "str" | "cm" | "num"; text: string };

const WORDS: Record<string, string[]> = {
  js: "const let var function return if else for while class import export from async await new try catch throw switch case break default typeof extends super of in".split(" "),
  py: "def return if elif else for while class import from as try except finally with lambda yield pass raise in not and or None True False async await".split(" "),
  php: "function return if else elseif foreach for while class public private protected echo new try catch namespace use extends implements static null true false array".split(" "),
  java: "class public private protected static void int long double float boolean new return if else for while try catch throws import package extends implements final null true false".split(" "),
  c: "int char void float double long short unsigned const return if else for while struct typedef switch case break static sizeof enum class public private namespace using template new delete include".split(" "),
  css: "color background display flex grid margin padding font border width height position content".split(" "),
  html: "html head body div span script style class href src button form input".split(" "),
  sql: "select from where insert into values update set delete create table join left right inner on and or not null primary key as order by group limit drop alter index".split(" "),
  skript: "command trigger on if else set to send player loop function return cancel event broadcast".split(" "),
};

function family(lang: string) {
  const value = lang.toLowerCase();
  if (["js", "jsx", "javascript", "ts", "tsx", "typescript", "mjs"].includes(value)) return "js";
  if (["py", "python"].includes(value)) return "py";
  if (value === "php") return "php";
  if (value === "java") return "java";
  if (["c", "h", "cpp", "c++", "cc", "hpp"].includes(value)) return "c";
  if (value === "css") return "css";
  if (["html", "htm", "xml", "svg"].includes(value)) return "html";
  if (["sql", "mysql"].includes(value)) return "sql";
  if (["skript", "sk"].includes(value)) return "skript";
  return "js";
}

function tokenize(code: string, lang: string): Token[] {
  const words = new Set(WORDS[family(lang)] ?? WORDS.js);
  const tokens: Token[] = [];
  let i = 0;
  const push = (kind: Token["kind"], text: string) => {
    if (!text) return;
    const prev = tokens[tokens.length - 1];
    if (prev && prev.kind === kind) prev.text += text;
    else tokens.push({ kind, text });
  };
  while (i < code.length) {
    const rest = code.slice(i);
    if (rest.startsWith("/*")) {
      const end = rest.indexOf("*/");
      const size = end === -1 ? rest.length : end + 2;
      push("cm", rest.slice(0, size));
      i += size;
      continue;
    }
    if (rest.startsWith("//") || (rest.startsWith("#") && family(lang) !== "css")) {
      const end = rest.indexOf("\n");
      const size = end === -1 ? rest.length : end;
      push("cm", rest.slice(0, size));
      i += size;
      continue;
    }
    const quote = rest[0];
    if (quote === '"' || quote === "'" || quote === "`") {
      let j = 1;
      while (j < rest.length) {
        if (rest[j] === "\\") {
          j += 2;
          continue;
        }
        if (rest[j] === quote) {
          j += 1;
          break;
        }
        if (quote === "`" && rest[j] === "\n") break;
        j += 1;
      }
      push("str", rest.slice(0, j));
      i += j;
      continue;
    }
    const num = /^(?:\d+\.\d+|\d+)/.exec(rest);
    if (num) {
      push("num", num[0]);
      i += num[0].length;
      continue;
    }
    const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
    if (word) {
      push(words.has(word[0]) ? "kw" : "plain", word[0]);
      i += word[0].length;
      continue;
    }
    push("plain", rest[0]);
    i += 1;
  }
  return tokens;
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  const tokens = tokenize(code.replace(/\n$/, ""), lang || "text");
  return (
    <div className="code-card">
      <div className="code-bar">
        <span>{lang || "code"}</span>
        <button
          type="button"
          className="press inline-flex min-h-8 items-center gap-1 rounded-full px-2 text-xs text-inherit"
          onClick={() => {
            void navigator.clipboard.writeText(code).then(() => {
              setCopied(true);
              toast.success("Code copied");
              window.setTimeout(() => setCopied(false), 1200);
            });
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>
        <code>
          {tokens.map((token, index) =>
            token.kind === "plain" ? (
              <span key={index}>{token.text}</span>
            ) : (
              <span key={index} className={`tok-${token.kind}`}>
                {token.text}
              </span>
            ),
          )}
        </code>
      </pre>
    </div>
  );
}

function inlineNodes(text: string, keyPrefix: string) {
  const nodes: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = re.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${index}`;
    if (token.startsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*")) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      const href = link?.[2] ?? "";
      if (link && /^https?:\/\//i.test(href)) {
        nodes.push(
          <a key={key} href={href} target="_blank" rel="noreferrer">
            {link[1]}
          </a>,
        );
      } else nodes.push(token);
    }
    last = match.index + token.length;
    index += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const parts = text.split(/```/);
  parts.forEach((part, index) => {
    if (index % 2 === 1) {
      const nl = part.indexOf("\n");
      const lang = (nl === -1 ? part : part.slice(0, nl)).trim();
      const code = nl === -1 ? "" : part.slice(nl + 1);
      blocks.push(<CodeBlock key={`c-${index}`} code={code} lang={lang} />);
      return;
    }
    const lines = part.replace(/\n$/, "").split("\n");
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) {
        i += 1;
        continue;
      }
      if (/^---+$/.test(line.trim())) {
        blocks.push(<hr key={`h-${index}-${i}`} className="border-line" />);
        i += 1;
        continue;
      }
      const heading = /^(#{1,3})\s+(.*)$/.exec(line);
      if (heading) {
        const Tag = heading[1].length === 1 ? "h1" : heading[1].length === 2 ? "h2" : "h3";
        blocks.push(<Tag key={`h-${index}-${i}`}>{inlineNodes(heading[2], `h${index}-${i}`)}</Tag>);
        i += 1;
        continue;
      }
      if (line.startsWith(">")) {
        const quoted: string[] = [];
        while (i < lines.length && lines[i].startsWith(">")) {
          quoted.push(lines[i].replace(/^>\s?/, ""));
          i += 1;
        }
        blocks.push(
          <blockquote key={`q-${index}-${i}`} className="quote">
            {inlineNodes(quoted.join(" "), `q${index}-${i}`)}
          </blockquote>,
        );
        continue;
      }
      if (/^\s*[-*]\s+/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
          i += 1;
        }
        blocks.push(
          <ul key={`u-${index}-${i}`}>
            {items.map((item, itemIndex) => (
              <li key={itemIndex}>{inlineNodes(item, `u${index}-${i}-${itemIndex}`)}</li>
            ))}
          </ul>,
        );
        continue;
      }
      if (/^\s*\d+\.\s+/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
          i += 1;
        }
        blocks.push(
          <ol key={`o-${index}-${i}`}>
            {items.map((item, itemIndex) => (
              <li key={itemIndex}>{inlineNodes(item, `o${index}-${i}-${itemIndex}`)}</li>
            ))}
          </ol>,
        );
        continue;
      }
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|```|>|\s*[-*]\s+|\s*\d+\.\s+|---+$)/.test(lines[i])) {
        para.push(lines[i]);
        i += 1;
      }
      blocks.push(<p key={`p-${index}-${i}`}>{inlineNodes(para.join(" "), `p${index}-${i}`)}</p>);
    }
  });
  return <div className="md">{blocks}</div>;
}
