from __future__ import annotations

import re
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from pypdf import PdfReader

app = FastAPI(title="ScholarMCP Python Sidecar", version="1.0.0")


class ParseRequest(BaseModel):
    filePath: str


class SectionChunk(BaseModel):
    id: str
    heading: str
    text: str
    pageStart: Optional[int] = None
    pageEnd: Optional[int] = None


class ParsedReference(BaseModel):
    rawText: str
    doi: Optional[str] = None
    title: Optional[str] = None
    year: Optional[int] = None
    authors: List[str] = []


class ParseResponse(BaseModel):
    parserName: str
    parserVersion: str
    confidence: float
    title: Optional[str] = None
    abstract: Optional[str] = None
    fullText: str
    sections: List[SectionChunk]
    references: List[ParsedReference]


def normalize_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def split_sections(text: str) -> List[SectionChunk]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return []

    heading_pattern = re.compile(
        r"^(abstract|introduction|background|related work|method(?:s)?|materials|results|discussion|conclusion|limitations|references)\b",
        re.IGNORECASE,
    )

    sections: List[SectionChunk] = []
    current_heading = "Body"
    current: List[str] = []

    def push_section() -> None:
        nonlocal current
        body = normalize_whitespace(" ".join(current))
        if not body:
            return
        section_id = f"section_{abs(hash((current_heading, body[:200])))}"
        sections.append(SectionChunk(id=section_id, heading=current_heading, text=body))

    for line in lines:
        if heading_pattern.match(line):
            if current:
                push_section()
            current_heading = line
            current = []
            continue
        current.append(line)

    if current:
        push_section()

    return sections


def extract_references(text: str) -> List[ParsedReference]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    ref_index = next((idx for idx, value in enumerate(lines) if value.lower() == "references"), -1)
    source = lines[ref_index + 1 :] if ref_index >= 0 else lines[-120:]

    output: List[ParsedReference] = []
    for line in source[:60]:
        if len(line) < 30:
            continue
        doi_match = re.search(r"10\.\d{4,9}/[\-._;()/:A-Z0-9]+", line, re.IGNORECASE)
        year_match = re.search(r"(?:19|20)\d{2}", line)
        output.append(
            ParsedReference(
                rawText=line,
                doi=(doi_match.group(0).lower() if doi_match else None),
                year=(int(year_match.group(0)) if year_match else None),
            )
        )

    return output


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/parse", response_model=ParseResponse)
def parse_pdf(request: ParseRequest) -> ParseResponse:
    path = Path(request.filePath).expanduser().resolve()
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"File does not exist: {path}")

    try:
        reader = PdfReader(str(path))
        pages = [page.extract_text() or "" for page in reader.pages]
    except Exception as exc:  # pragma: no cover - runtime parser failures
        raise HTTPException(status_code=400, detail=f"Unable to parse PDF: {exc}") from exc

    raw_text = "\n".join(pages)
    full_text = normalize_whitespace(raw_text)
    if not full_text:
        raise HTTPException(status_code=422, detail="Parser produced empty text")

    lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
    title = lines[0] if lines else None
    abstract = None
    for idx, line in enumerate(lines):
        if line.lower().startswith("abstract"):
            abstract = normalize_whitespace(" ".join(lines[idx : idx + 5]))
            break

    return ParseResponse(
        parserName="python-sidecar-pypdf",
        parserVersion="pypdf-6.0.0",
        confidence=0.74,
        title=title,
        abstract=abstract,
        fullText=full_text,
        sections=split_sections(raw_text),
        references=extract_references(raw_text),
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8090)
