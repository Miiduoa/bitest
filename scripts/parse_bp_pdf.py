#!/usr/bin/env python3
"""
從 BP_Reference260_20220401.pdf 萃取 BI 規劃師參考題型，輸出 questions.json。
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pdfplumber

HEADER_LINES = frozenset(
    {
        "中華企業資源規劃學會 專業認證",
        "BI 規劃師-參考題型",
    }
)


def clean_page_text(raw: str) -> str:
    lines_out: list[str] = []
    for line in raw.splitlines():
        s = line.strip()
        if not s:
            continue
        if s in HEADER_LINES:
            continue
        if re.fullmatch(r"\d{1,2}", s):
            continue
        lines_out.append(s)
    return "\n".join(lines_out)


CHAPTER_RE = re.compile(r"第\s*(\d+)\s*章\s*(.+?)\s*-\s*(\d+)\s*題")
Q_START_RE = re.compile(r"\(([A-D])\)\s*(\d+)\.\s*", re.MULTILINE)


def find_chapter_markers(text: str) -> list[tuple[int, int, str, int]]:
    out: list[tuple[int, int, str, int]] = []
    for m in CHAPTER_RE.finditer(text):
        cid = int(m.group(1))
        title = m.group(2).strip()
        nq = int(m.group(3))
        out.append((m.start(), cid, title, nq))
    return out


def chapter_at(pos: int, markers: list[tuple[int, int, str, int]]) -> tuple[int, str]:
    cur: tuple[int, str] | None = None
    for start, cid, title, _ in markers:
        if start > pos:
            break
        cur = (cid, title)
    if cur is None:
        return 0, "未分類"
    return cur


def split_options(opts_part: str) -> dict[str, str]:
    bounds: list[tuple[str, int, int]] = []
    for letter in "ABCD":
        m = re.search(rf"\({letter}\)\s*", opts_part)
        if not m:
            raise ValueError(f"missing option ({letter}) in: {opts_part[:120]!r}...")
        bounds.append((letter, m.start(), m.end()))
    bounds.sort(key=lambda x: x[1])
    result: dict[str, str] = {}
    for i, (letter, _s, content_start) in enumerate(bounds):
        end = bounds[i + 1][1] if i + 1 < len(bounds) else len(opts_part)
        chunk = opts_part[content_start:end].strip()
        chunk = re.sub(r"\s+", " ", chunk)
        result[letter] = chunk.strip()
    return result


def parse_questions(full_text: str) -> tuple[list[dict], list[dict]]:
    markers = find_chapter_markers(full_text)
    chapter_meta: dict[int, dict] = {}
    for _pos, cid, title, nq in markers:
        chapter_meta[cid] = {"id": cid, "title": title, "questionCountPdf": nq}

    spans = list(Q_START_RE.finditer(full_text))
    if len(spans) != 260:
        print(f"[warn] 預期 260 題，實際找到 {len(spans)} 題", file=sys.stderr)

    questions: list[dict] = []
    for i, m in enumerate(spans):
        ans_key = m.group(1)
        qnum = int(m.group(2))
        start = m.start()
        end = spans[i + 1].start() if i + 1 < len(spans) else len(full_text)
        block = full_text[start:end].strip()

        m_head = re.match(r"^\(([A-D])\)\s*(\d+)\.\s*", block, re.DOTALL)
        if not m_head:
            raise RuntimeError(f"bad block header: {block[:80]!r}")
        rest_after_num = block[m_head.end() :].lstrip("\n ")
        ma = re.search(r"\(A\)\s*", rest_after_num)
        if not ma:
            raise RuntimeError(f"no (A) in Q{qnum}: {rest_after_num[:160]!r}")

        stem = rest_after_num[: ma.start()].strip()
        stem = re.sub(r"\s+", " ", stem)

        opts_part = rest_after_num[ma.start() :]
        options = split_options(opts_part)

        cid, ctitle = chapter_at(start, markers)
        questions.append(
            {
                "id": qnum,
                "chapterId": cid,
                "chapterTitle": ctitle,
                "stem": stem,
                "options": [{"key": k, "text": options[k]} for k in "ABCD"],
                "answer": ans_key,
            }
        )

    chapters = [chapter_meta[k] for k in sorted(chapter_meta)]
    seen_per_chapter: dict[int, int] = {}
    for q in questions:
        cid = q["chapterId"]
        seen_per_chapter[cid] = seen_per_chapter.get(cid, 0) + 1
    for ch in chapters:
        cid = ch["id"]
        ch["questionCountParsed"] = seen_per_chapter.get(cid, 0)

    return chapters, questions


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    pdf_default = Path("/Users/miiduoa/Downloads/BP_Reference260_20220401.pdf")
    pdf_path = Path(sys.argv[1]) if len(sys.argv) > 1 else pdf_default
    if not pdf_path.is_file():
        print(f"找不到 PDF: {pdf_path}", file=sys.stderr)
        sys.exit(1)

    blobs: list[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            blobs.append(clean_page_text(page.extract_text() or ""))

    full = "\n".join(blobs)
    chapters, questions = parse_questions(full)

    out = {"source": pdf_path.name, "total": len(questions), "chapters": chapters, "questions": questions}
    out_path = root / "questions.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"寫入 {out_path}，共 {len(questions)} 題，{len(chapters)} 章")


if __name__ == "__main__":
    main()
