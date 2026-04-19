#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const ROOTS = ["client/src", "server/src", "shared"];
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".next"]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

function collectCommentRanges(source, filename) {
  const ranges = new Map();
  const add = (range) => {
    ranges.set(`${range.pos}:${range.end}`, range);
  };

  const sf = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
  );

  function visit(node) {
    const leading = ts.getLeadingCommentRanges(source, node.getFullStart());
    if (leading) for (const r of leading) add(r);
    const trailing = ts.getTrailingCommentRanges(source, node.getEnd());
    if (trailing) for (const r of trailing) add(r);
    ts.forEachChild(node, visit);
  }
  visit(sf);

  const tokenScan = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    sf.languageVariant,
    source,
  );
  tokenScan.setText(source);
  let kind;
  while ((kind = tokenScan.scan()) !== ts.SyntaxKind.EndOfFileToken) {
    if (
      kind === ts.SyntaxKind.SingleLineCommentTrivia ||
      kind === ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      add({
        kind,
        pos: tokenScan.getTokenPos(),
        end: tokenScan.getTextPos(),
      });
    }
  }

  return Array.from(ranges.values());
}

function isJsDoc(text) {
  return (
    text.startsWith("/**") &&
    !text.startsWith("/***") &&
    text.length > 3
  );
}

function isTripleSlashDirective(text) {
  return /^\/\/\/\s*</.test(text);
}

function stripComments(source, filename) {
  const all = collectCommentRanges(source, filename);
  const toRemove = all.filter((r) => {
    const text = source.slice(r.pos, r.end);
    if (r.kind === ts.SyntaxKind.MultiLineCommentTrivia && isJsDoc(text)) {
      return false;
    }
    if (r.kind === ts.SyntaxKind.SingleLineCommentTrivia && isTripleSlashDirective(text)) {
      return false;
    }
    return true;
  });
  if (toRemove.length === 0) return source;

  toRemove.sort((a, b) => b.pos - a.pos);
  let out = source;
  for (const r of toRemove) {
    let start = r.pos;
    let end = r.end;
    if (r.kind === ts.SyntaxKind.SingleLineCommentTrivia) {
      while (start > 0 && (out[start - 1] === " " || out[start - 1] === "\t")) {
        start -= 1;
      }
      if (out[end] === "\n") end += 1;
      else if (out[end] === "\r" && out[end + 1] === "\n") end += 2;
    }
    out = out.slice(0, start) + out.slice(end);
  }

  out = out.replace(/^[ \t]+\n/gm, "\n");
  out = out.replace(/\n{3,}/g, "\n\n");
  out = out.replace(/\{\n\n/g, "{\n");
  out = out.replace(/\n\n([ \t]*\})/g, "\n$1");

  return out;
}

function stripWholeLineComments(source) {
  const before = source;
  const out = source
    .split("\n")
    .filter((line) => {
      if (/^\s*\/\/\/\s*</.test(line)) return true;
      if (/^\s*\/\/.*$/.test(line)) return false;
      return true;
    })
    .join("\n");
  if (out === before) return out;
  return out.replace(/\n{3,}/g, "\n\n");
}

const files = ROOTS.flatMap((r) => walk(r));
let changed = 0;
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const astStripped = stripComments(src, f);
  const finalOut = stripWholeLineComments(astStripped);
  if (finalOut !== src) {
    writeFileSync(f, finalOut);
    changed++;
  }
}
console.log(`Stripped comments from ${changed} of ${files.length} files.`);
