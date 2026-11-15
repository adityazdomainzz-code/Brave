import "@tanstack/react-start/server-only";
import { inflateRawSync, inflateSync } from "node:zlib";

const TEXT_EXT = new Set([
  "txt",
  "csv",
  "json",
  "js",
  "ts",
  "tsx",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "php",
  "java",
  "c",
  "cpp",
  "h",
  "hpp",
  "cc",
  "css",
  "html",
  "htm",
  "sql",
  "md",
  "sk",
  "skript",
  "xml",
  "yml",
  "yaml",
  "go",
  "rs",
  "rb",
  "sh",
]);

export const ALLOWED_EXT = new Set([...TEXT_EXT, "pdf", "docx"]);

export function fileExt(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "";
  const match = base.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

export function safeName(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "file";
  const cleaned = base.replace(/[^\w.\- ()[\]]+/g, "_").replace(/^\.+/, "").slice(0, 120);
  return cleaned || "file";
}

export function cleanText(value: string): string {
  return value.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();
}

export function extractText(filename: string, bytes: Buffer): string {
  const ext = fileExt(filename);
  if (ext === "pdf") return cleanText(extractPdf(bytes)).slice(0, 60_000);
  if (ext === "docx") return cleanText(extractDocx(bytes)).slice(0, 60_000);
  if (!TEXT_EXT.has(ext)) return "";
  const text = bytes.toString("utf8");
  if (text.includes("\u0000")) return "";
  if (ext === "json") {
    try {
      return cleanText(JSON.stringify(JSON.parse(text), null, 2)).slice(0, 60_000);
    } catch {
      return cleanText(text).slice(0, 60_000);
    }
  }
  return cleanText(text).slice(0, 60_000);
}

function extractDocx(buf: Buffer): string {
  const xml = readZipText(buf, "word/document.xml");
  if (!xml) return "";
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, '"')
    .replace(/&#(\d+);/g, (_, n: string) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCharCode(code) : "";
    });
}

function readZipText(buf: Buffer, wanted: string): string | null {
  const sig = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  let offset = 0;
  while (offset + 30 < buf.length) {
    if (buf.readUInt32LE(offset) !== 0x04034b50) {
      const next = buf.indexOf(sig, offset + 1);
      if (next < 0) break;
      offset = next;
      continue;
    }
    const method = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    if (nameStart + nameLen > buf.length) break;
    const name = buf.toString("utf8", nameStart, nameStart + nameLen);
    const dataStart = nameStart + nameLen + extraLen;
    if (compSize === 0) {
      const next = buf.indexOf(sig, dataStart);
      if (name === wanted && next > dataStart) {
        return inflateZip(buf.subarray(dataStart, next), method);
      }
      if (next < 0) break;
      offset = next;
      continue;
    }
    const dataEnd = dataStart + compSize;
    if (dataEnd > buf.length) break;
    if (name === wanted) return inflateZip(buf.subarray(dataStart, dataEnd), method);
    offset = dataEnd;
  }
  return null;
}

function inflateZip(data: Buffer, method: number): string | null {
  try {
    if (method === 0) return data.toString("utf8");
    if (method === 8) return inflateRawSync(data).toString("utf8");
  } catch {
    return null;
  }
  return null;
}

function extractPdf(buf: Buffer): string {
  const latin = buf.toString("latin1");
  const parts: string[] = [];
  const re = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(latin))) {
    const start = match.index + match[0].length;
    const end = latin.indexOf("endstream", start);
    if (end < 0) break;
    let raw = Buffer.from(latin.slice(start, end), "latin1");
    while (raw.length && (raw[raw.length - 1] === 0x0a || raw[raw.length - 1] === 0x0d)) {
      raw = raw.subarray(0, -1);
    }
    let text = raw.toString("latin1");
    try {
      text = inflateSync(raw).toString("latin1");
    } catch {
      /* uncompressed stream */
    }
    if (/Tj|TJ|'|"/.test(text)) parts.push(pdfLiterals(text));
    re.lastIndex = end + 9;
  }
  return parts.join("\n");
}

function pdfLiterals(source: string): string {
  const parts: string[] = [];
  const re = /\((?:\\.|[^\\)])*\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) parts.push(decodePdfLiteral(match[0]));
  return parts.join(" ");
}

function decodePdfLiteral(token: string): string {
  const inner = token.slice(1, -1);
  let out = "";
  for (let i = 0; i < inner.length; i += 1) {
    if (inner[i] !== "\\") {
      out += inner[i];
      continue;
    }
    const next = inner[(i += 1)];
    if (!next) break;
    if (next === "n") out += "\n";
    else if (next === "r") out += "\r";
    else if (next === "t") out += "\t";
    else if (next === "(" || next === ")" || next === "\\") out += next;
    else if (next >= "0" && next <= "7") {
      let oct = next;
      for (let k = 0; k < 2; k += 1) {
        const peek = inner[i + 1];
        if (!peek || peek < "0" || peek > "7") break;
        oct += inner[(i += 1)];
      }
      out += String.fromCharCode(parseInt(oct, 8));
    } else out += next;
  }
  return out;
}
