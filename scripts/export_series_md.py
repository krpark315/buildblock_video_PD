#!/usr/bin/env python3
"""시리즈 방향 10가지를 별도 마크다운으로 추출한다.

사이트 본문은 선택한 1개(K-뷰티 1호점 임장기)만 다루므로,
나머지 후보와 레퍼런스 전체는 이 파일로 남겨 둔다.
"""

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT_DIR = HERE.parent
DATA = OUT_DIR / "data/report-data.js"
OUT = OUT_DIR / "docs/시리즈_방향_10가지.md"

# 표에 쓸 짧은 페르소나 라벨. 원래 별명이 한 문장이라 표 안에서는 줄여 쓴다.
SHORT = {
    "T01": "조건 확인형",
    "T02": "현지 검증형",
    "T03": "생활 판단형",
    "T04": "뷰티 의사결정자",
}


def load():
    raw = DATA.read_text(encoding="utf-8")
    return json.loads(raw.split("=", 1)[1].strip().rstrip(";"))


def build():
    d = load()
    plans = d["plans"]
    lib = d["referenceLibrary"]
    L = []

    L.append("# 콘텐츠 시리즈 방향 10가지")
    L.append("")
    L.append("빌드블럭 Instagram 릴스·YouTube 공개 댓글 53건에서 도출한 페르소나 4명을 "
             "빌드블럭 사업과 붙여, **같은 포맷을 반복할 수 있는 시리즈** 단위로 정리한 후보 목록입니다.")
    L.append("")
    L.append("이 가운데 **04 K-뷰티 1호점 임장기**를 first pick으로 골라 리포트 본문에서 기획 과정을 전개했습니다. "
             "나머지 9개는 다음 후보로 이 문서에 보관합니다.")
    L.append("")

    # 한눈에 보기
    L.append("## 한눈에 보기")
    L.append("")
    L.append("| # | 시리즈 | 성격 | 대상 페르소나 | 사업 트랙 |")
    L.append("| --- | --- | --- | --- | --- |")
    for p in plans:
        mark = " **★**" if p["recommended"] else ""
        L.append(f"| {p['no']}{mark} | {p['title']} | {p['badge']} | "
                 f"{' · '.join(SHORT[i] for i in p['personaIds'])} | {p['businessTrack']} |")
    L.append("")
    L.append("`기존 포맷 개선안`은 빌드블럭이 이미 제작 중인 팟캐스트·현지 뉴스에 해당하는 것이고, "
             "`신규 시리즈`는 지금 없는 포맷입니다. ★는 first pick입니다.")
    L.append("")

    # 개별 카드
    L.append("---")
    L.append("")
    L.append("## 개별 시리즈")
    for p in plans:
        L.append("")
        L.append(f"### {p['no']}. {p['title']}")
        L.append("")
        L.append(f"> {p['subtitle']}")
        L.append("")
        L.append(f"- **성격** {p['badge']}" + ("  ·  **first pick**" if p["recommended"] else ""))
        L.append(f"- **대상 페르소나** {', '.join(p['personaNames'])}")
        L.append(f"- **사업 트랙** {p['businessTrack']}")
        L.append(f"- **포맷** {p['format']}")
        L.append(f"- **무엇을 반복하는가** {p['repeatFormat']}")
        L.append("")
        if p["recommended"]:
            L.append(f"**왜 이것을 먼저 하는가**  \n{p['recommendReason']}")
            L.append("")
        L.append(f"**누구를 위한 기획인가**  \n{p['personaWhy']}")
        L.append("")
        L.append(f"**빌드블럭 어떤 사업과 붙는가**  \n{p['businessWhy']}")
        L.append("")
        L.append(f"**기획의도**  \n{p['intent']}")
        L.append("")
        L.append("**초기 기대효과**")
        for e in p["expectedEffect"]:
            L.append(f"- {e}")
        L.append("")
        L.append("**참고 레퍼런스**")
        for r in p["references"]:
            L.append(f"- [{r['org']} — {r['channel']}]({r['url']}) · {r['region']} {r['kind']}")
        L.append("")
        L.append(f"**근거 댓글** {len(p['evidenceIds'])}건 — `{', '.join(p['evidenceIds'][:12])}"
                 + ("…`" if len(p["evidenceIds"]) > 12 else "`"))
        L.append("")

    # 레퍼런스 라이브러리
    L.append("---")
    L.append("")
    L.append(f"## 참고 레퍼런스 {len(lib)}건")
    L.append("")
    L.append("2026-08-12에 웹에서 실제 채널·프로그램 정보를 확인했습니다. "
             "확인한 사실과 빌드블럭 적용 방안을 분리해 적습니다.")
    L.append("")
    for region in ("한국", "해외"):
        L.append(f"### {region}")
        L.append("")
        for r in [x for x in lib if x["region"] == region]:
            L.append(f"#### {r['org']} — [{r['channel']}]({r['url']})")
            L.append(f"*{r['kind']}*")
            L.append("")
            L.append(f"- **확인한 사실** {r['fact']}")
            L.append(f"- **빌드블럭에 어떻게 쓰나** {r['takeaway']}")
            L.append("")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(L) + "\n", encoding="utf-8")
    print(f"[OK] {OUT.relative_to(OUT_DIR)} ({OUT.stat().st_size:,} bytes)")
    print(f"  시리즈 {len(plans)}개 / 레퍼런스 {len(lib)}건")


if __name__ == "__main__":
    build()
