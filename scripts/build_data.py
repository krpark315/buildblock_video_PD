#!/usr/bin/env python3
"""빌드블럭 릴스·유튜브 댓글 페르소나 리포트 데이터 빌드.

입력(모두 기존 코덱스 산출물, 새로 분석하지 않음):
  - deliverables/buildblock-comment-research/data/research.json
  - _workspace/buildblock_comment_research_local_evidence/local-evidence-data.js  (53 레코드)
  - _workspace/instagram_analysis/reels_60.csv
  - _workspace/instagram_analysis/commenter_profiles_41.csv
  - _workspace/youtube_analysis/video_comments_sample.csv

출력: data/report-data.js  (window.BB = {...})
"""

import csv
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

from persona_copy import (
    INTRO_COPY,
    PERSONA_ORDER,
    KEYWORD_MEANING,
    PERSONA_COPY,
    PLAN_FIT_NOTE,
    THEME_COPY,
)
from pick_copy import PICK
from plan_copy import PLANS, REFERENCES

HERE = Path(__file__).resolve().parent
OUT_DIR = HERE.parent
BASE = OUT_DIR.parent.parent
RESEARCH = BASE / "deliverables/buildblock-comment-research/data/research.json"
WS = BASE / "_workspace"
LEDGER = WS / "buildblock_comment_research_local_evidence/local-evidence-data.js"
REELS_CSV = WS / "instagram_analysis/reels_60.csv"
PROFILES_CSV = WS / "instagram_analysis/commenter_profiles_41.csv"
YT_CSV = WS / "youtube_analysis/video_comments_sample.csv"

COLLECTED_ON = "2026-07-31"

# 댓글 키워드 신호 사전. 분석 방법 설명과 아카이브 필터에 함께 쓴다.
KEYWORD_GROUPS = [
    {
        "id": "K1",
        "label": "위치·관할 확인",
        "meaning": "정보가 미국의 어느 주·도시·매장에 적용되는지를 되묻는 표현",
        "terms": ["어느 주", "어느주", "몇 개 주", "6개 주", "달라스", "시애틀", "hawaii", "하와이",
                  "지역", "동네", "어딘가요", "어디인가요", "실리콘밸리", "엘에이", "미국내", "현지"],
    },
    {
        "id": "K2",
        "label": "가격·금액 확인",
        "meaning": "실제 지출 규모를 확정하려는 표현",
        "terms": ["금액", "가격", "얼마", "$", "리스팅", "4,999,999", "200"],
    },
    {
        "id": "K3",
        "label": "자격·적용 조건",
        "meaning": "내 신분·조건에서도 그 혜택이나 제도가 적용되는지 확인하는 표현",
        "terms": ["적용", "유학생", "국제학생", "인터네셔널", "자산요건", "요건", "재정보조",
                  "심사", "영주권", "시민권", "여부"],
    },
    {
        "id": "K4",
        "label": "안전·리스크 확인",
        "meaning": "먹거나 사기 전에 위험 요소를 확인하려는 표현",
        "terms": ["오염", "공장번호", "리콜", "불나면", "충전소", "만만치"],
    },
    {
        "id": "K5",
        "label": "현지 경험 기반 보정",
        "meaning": "현지 거주·방문 경험을 근거로 영상의 표현이나 시점을 바로잡는 표현",
        "terms": ["현지인", "우리 동네", "지역마다", "시간마다", "요즘", "사람없어요", "황당",
                  "실망", "줄안서", "살만", "손에 꼽", "안팔아서"],
    },
    {
        "id": "K6",
        "label": "감정·공감 표현",
        "meaning": "추가 정보 요청 없이 감상과 공유 의사를 남기는 표현",
        "terms": ["이쁘", "예쁘", "귀엽", "미쳤다", "와우", "😍", "👏", "🙌", "❤️", "💝", "💖",
                  "사랑해", "구경", "잘 하구"],
    },
]

# 페르소나 판독 방법 4단계. analysis.md의 페르소나 해석 원칙을 화면용으로 정리한 것.
METHOD_STEPS = [
    {
        "step": "1",
        "title": "댓글 원문을 신호 단위로 자른다",
        "body": "53건의 댓글을 문장이 아니라 신호 단위로 읽는다. 한 댓글에 질문과 감상이 섞여 있으면 "
                "어떤 행동을 하려고 쓴 문장인지를 기준으로 대표 신호 하나만 남긴다.",
        "example": "“어느주에서샀나요 달라스는없다고하는데” → 감상이 아니라 판매 지역을 확정하려는 위치 확인 신호.",
    },
    {
        "step": "2",
        "title": "키워드 사전 6종으로 신호를 분류한다",
        "body": "위치·가격·자격·안전·현지보정·공감 여섯 갈래의 표현 사전을 만들어 매칭한다. "
                "사전은 댓글에 실제로 등장한 표현만으로 구성하고, 등장하지 않은 단어는 넣지 않는다.",
        "example": "“한국유학생도 적용 되려나” → K3 자격·적용 조건에 매칭.",
    },
    {
        "step": "3",
        "title": "신호를 5개 반복 주제로 묶는다",
        "body": "같은 행동을 유발한 신호끼리 묶어 T01~T05 주제를 만든다. 한 댓글은 한 주제에만 배정해 "
                "중복 계산을 막는다. T05는 사람이 아니라 브랜드 공식 답글 단계다.",
        "example": "위치·가격·자격·안전 확인은 전부 T01 조건·현장 디테일 확인으로 수렴한다.",
    },
    {
        "step": "4",
        "title": "주제를 페르소나로 번역하고 원문으로 되돌아간다",
        "body": "주제별로 무엇을 못 해서 그 댓글을 썼는지를 고통과 욕구로 바꾸고, 검색창에 넣을 문장으로 옮긴다. "
                "모든 페르소나 카드는 근거가 된 댓글 원문과 원본 게시물로 되돌아갈 수 있어야 한다.",
        "example": "조건 확인형 탐색자 → “미국 주별 홀푸드 장바구니 판매 매장” 같은 검색 문장으로 변환.",
    },
]

def load_ledger():
    text = LEDGER.read_text(encoding="utf-8")
    payload = text[text.index("=") + 1:].strip().rstrip(";")
    return json.loads(payload)


def norm(text):
    """공백 정리 + NFC 정규화.

    원자료 CSV의 한글이 macOS 분해형(NFD)이라 그대로 자르면 자모가 쪼개진다.
    """
    return unicodedata.normalize("NFC", re.sub(r"\s+", " ", (text or "")).strip())


# 영상별 주요 신호 문장을 만들 때 쓰는 주제별 설명구.
THEME_PHRASE = {
    "T01": "영상에 빠진 조건을 되묻는",
    "T02": "현지 경험을 근거로 영상 내용을 바로잡는",
    "T03": "자기 생활 기준으로 살지 말지를 따지는",
    "T04": "추가 질문 없이 감상만 남기는",
    "T05": "빌드블럭 공식 계정이 직접 답한",
}

# T01은 무엇을 되묻는지가 영상마다 달라서 인용 댓글의 키워드 신호로 문구를 고른다.
T01_PHRASE_BY_KEYWORD = {
    "K1": "어느 주·도시에 해당하는지 되묻는",
    "K2": "실제 금액이 얼마인지 묻는",
    "K3": "자기 신분에도 적용되는지 확인하는",
    "K4": "안전한지 먼저 확인하려는",
}


def describe_content_response(content, recs):
    """그 영상에 실제로 달린 댓글을 인용해 영상별 주요 신호 문장을 만든다.

    원자료의 주제 단위 요약을 그대로 쓰면 18편 중 대부분이 같은 문장이 되어
    영상별로 무엇이 달랐는지가 보이지 않는다.
    """
    dominant = content["dominantTheme"]
    same = [r for r in recs if r["themeId"] == dominant]
    # 인용에는 이모지뿐인 댓글 대신 문장이 있는 것을 우선한다.
    quotable = sorted(
        [r for r in same if r["textLength"] >= 4],
        key=lambda r: -(len(r["keywordGroups"]) * 12 + min(r["textLength"], 60) + r["likesNum"] * 3),
    )
    phrase = THEME_PHRASE[dominant]
    count = len(same)

    if quotable:
        # T01은 위치·가격·자격·안전 중 무엇을 물었는지가 영상마다 다르다.
        if dominant == "T01":
            for kw in quotable[0]["keywordGroups"]:
                if kw in T01_PHRASE_BY_KEYWORD:
                    phrase = T01_PHRASE_BY_KEYWORD[kw]
                    break
        quote = quotable[0]["text"]
        if len(quote) > 42:
            quote = quote[:42].rstrip() + "…"
        head = f"이 영상에는 “{quote}”처럼 {phrase} 댓글이 {count}건 달렸습니다."
    else:
        head = f"이 영상에는 이모지와 짧은 감탄처럼 {phrase} 댓글이 {count}건 달렸습니다."

    others = [t for t in content["themeCounts"] if t != dominant]
    if others:
        tail = " 나머지는 " + ", ".join(
            f"{THEME_PHRASE[t]} 반응 {content['themeCounts'][t]}건" for t in sorted(others)
        ) + "입니다."
        return head + tail
    return head


BRAND_HANDLE = "buildblock_ai"
BRAND_LABEL = "빌드블럭 공식 계정"


def mask_mentions(text, handle_to_label):
    """공식 답글 본문의 @멘션을 작성자 ID로 치환한다.

    빌드블럭이 질문자를 부르며 답한 댓글이 5건 있는데, 그대로 두면
    본문을 마스킹해도 답글에서 계정명이 그대로 드러난다.
    매핑에 없는 멘션(핸들 변경 등)은 [작성자]로 덮어 원문이 남지 않게 한다.
    """
    def repl(m):
        return handle_to_label.get(m.group(1), "[작성자]")

    return re.sub(r"@([A-Za-z0-9._]+)", repl, text)


def match_keywords(text):
    low = (text or "").lower()
    hits = []
    for group in KEYWORD_GROUPS:
        for term in group["terms"]:
            if term.lower() in low:
                hits.append(group["id"])
                break
    return hits


def build():
    research = json.loads(RESEARCH.read_text(encoding="utf-8"))
    ledger = load_ledger()
    reels = {r["shortcode"]: r for r in csv.DictReader(REELS_CSV.open(encoding="utf-8"))}
    profiles = {p["username"]: p for p in csv.DictReader(PROFILES_CSV.open(encoding="utf-8"))}
    yt_rows = {r["comment_id"]: r for r in csv.DictReader(YT_CSV.open(encoding="utf-8"))}
    yt_videos = {v["id"]: v for v in research["youtubeVideos"]}

    # ---------- 계정명 마스킹 표 ----------
    # 제출본에는 타인의 실제 계정명을 남기지 않는다. 원자료 CSV의 account_id(A001~)를
    # 그대로 재사용해 새 식별자를 만들지 않는다. 빌드블럭 공식 계정만 예외로 둔다.
    handle_to_label = {u: p["account_id"] for u, p in profiles.items()}
    handle_to_label[BRAND_HANDLE] = BRAND_LABEL

    # ---------- 댓글 레코드 53건 ----------
    records = []
    for r in ledger["records"]:
        eid = r["localEvidenceId"]
        platform = r["platform"]
        text = norm(r["commentTextExact"])
        shot = r.get("commentScreenshotLocalRef") or r.get("screenshotLocalRef") or ""
        shot_file = Path(shot).name if shot else ""

        if platform == "Instagram":
            shortcode = r["contentLocalId"].replace("IG-", "")
            # 원장의 contentTitle은 일부가 잘려 있어 원자료 CSV의 캡션을 정본으로 쓴다.
            title = norm(reels.get(shortcode, {}).get("caption")) or r["contentTitle"]
            handle = r.get("authorHandle", "")
            prof = profiles.get(handle, {})
            observed = [t.strip() for t in (prof.get("observed_themes") or "").split(";") if t.strip()]
            author_label = handle_to_label.get(handle, "계정 미수집")
            likes_raw = ""
            time_label = ""
            content_url = r["contentUrl"]
            thumb = f"ig_{shortcode}.jpg"
        else:
            shortcode = r["contentLocalId"].replace("YT-", "")
            title = norm(yt_videos.get(shortcode, {}).get("title")) or r["contentTitle"]
            handle = yt_rows.get(eid, {}).get("commenter_handle_anonymized", "")
            # 원자료가 이미 "댓글자_A" 형태로 익명화돼 있다. 표기만 Y-A로 통일한다.
            author_label = handle.replace("댓글자_", "Y-") if handle else "계정 미수집"
            observed = []
            likes_raw = yt_rows.get(eid, {}).get("comment_like_count", "")
            time_label = ""
            content_url = r["contentUrl"]
            thumb = f"yt_{shortcode}.jpg"

        records.append({
            "id": eid,
            "platform": platform,
            "themeId": r["themeId"],
            "personaIds": r["personaIds"],
            "responseStage": r.get("responseStage", ""),
            "isBrandReply": r["themeId"] == "T05",
            "contentId": r["contentLocalId"],
            "contentTitle": title,
            "contentUrl": content_url,
            "shortcode": shortcode,
            "thumb": thumb,
            # 실제 계정명과 프로필 URL은 산출 데이터에 넣지 않는다.
            "authorLabel": author_label,
            "profileVisibility": r.get("profileVisibility", ""),
            "observedThemes": observed,
            "text": mask_mentions(text, handle_to_label),
            "textLength": len(text),
            "likes": likes_raw,
            "timeLabel": time_label,
            "permalink": r.get("commentPermalink", ""),
            "screenshot": shot_file,
            "screenshotSha256": r.get("screenshotSha256", ""),
            "collectedOn": r.get("collectedOn", COLLECTED_ON),
            "sourceFile": r.get("sourceFile", ""),
            "keywordGroups": match_keywords(text),
        })

    # Instagram 원본 CSV에서 좋아요·시간 라벨 보강
    ig_meta = {}
    for row in csv.DictReader((WS / "instagram_analysis/comments_evidence_48.csv").open(encoding="utf-8")):
        ig_meta[row["evidence_id"]] = row
    for rec in records:
        meta = ig_meta.get(rec["id"])
        if meta:
            rec["likes"] = meta.get("comment_likes", "")
            rec["timeLabel"] = meta.get("time_label", "")
    for rec in records:
        try:
            rec["likesNum"] = int(rec["likes"])
        except (TypeError, ValueError):
            rec["likesNum"] = 0

    by_theme = defaultdict(list)
    for rec in records:
        by_theme[rec["themeId"]].append(rec)

    # ---------- 분석 대상 콘텐츠 18건 ----------
    contents = []
    seen = defaultdict(list)
    for rec in records:
        seen[rec["contentId"]].append(rec)

    for content_id, recs in seen.items():
        first = recs[0]
        platform = first["platform"]
        code = first["shortcode"]
        theme_counts = Counter(r["themeId"] for r in recs)
        if platform == "Instagram":
            reel = reels.get(code, {})
            contents.append({
                "id": content_id,
                "platform": "Instagram",
                "format": "릴스",
                "code": code,
                "title": first["contentTitle"],
                "topic": reel.get("topic", ""),
                "url": first["contentUrl"],
                "thumb": f"ig_{code}.jpg",
                "views": int(reel["views"]) if reel.get("views") else None,
                "likes": int(reel["likes"]) if reel.get("likes") else None,
                "commentsDisplayed": int(reel["comments"]) if reel.get("comments") else 0,
                "sampled": len(recs),
                "durationSec": round(float(reel["duration_sec"]), 1) if reel.get("duration_sec") else None,
                "publishedAt": (reel.get("published_at") or "")[:10],
                "themeCounts": dict(theme_counts),
                "dominantTheme": theme_counts.most_common(1)[0][0],
            })
        else:
            vid = yt_videos.get(code, {})
            contents.append({
                "id": content_id,
                "platform": "YouTube",
                "format": vid.get("contentType", "영상"),
                "code": code,
                "title": first["contentTitle"],
                "topic": vid.get("contentType", ""),
                "url": first["contentUrl"],
                "thumb": f"yt_{code}.jpg",
                "views": vid.get("viewsDisplayedApprox"),
                "likes": vid.get("likes"),
                "commentsDisplayed": vid.get("comments") or len(recs),
                "sampled": len(recs),
                "duration": vid.get("duration"),
                "publishedAt": vid.get("publishedRelative", ""),
                "themeCounts": dict(theme_counts),
                "dominantTheme": theme_counts.most_common(1)[0][0],
            })

    contents.sort(key=lambda c: (c["platform"] != "Instagram", -(c["sampled"] or 0), -(c["views"] or 0)))

    # 영상별 분석 테이블용 서술 보강
    topic_notes = {t["id"]: t for t in research["commentThemes"]}
    # 제목은 표기가 갈릴 수 있으므로 게시물 URL로 조인한다.
    content_summaries = {c["postUrl"]: c for c in research["contentResponseSummaries"]}
    for c in contents:
        summary = content_summaries.get(c["url"], {})
        # 원자료의 dominantResponse는 주제 단위 문장이라 18편 중 대부분이 똑같다.
        # 영상별 분석이므로 그 영상에 실제로 달린 댓글을 인용해 개별 문장을 만든다.
        c["dominantResponse"] = describe_content_response(c, seen[c["id"]])
        c["nextQuestion"] = summary.get("nextQuestion", topic_notes[c["dominantTheme"]]["nextQuestion"])
        # 기획 적합성: 조건 확인·현지 보정이 절반 이상이면 의사결정형, 공감 위주면 도달형
        decision = c["themeCounts"].get("T01", 0) + c["themeCounts"].get("T02", 0)
        empathy = c["themeCounts"].get("T04", 0)
        judge = c["themeCounts"].get("T03", 0)
        if decision >= max(empathy, judge) and decision > 0:
            c["planFit"] = "의사결정형"
        elif judge >= max(decision, empathy):
            c["planFit"] = "비교판단형"
        else:
            c["planFit"] = "도달형"
        c["planFitNote"] = PLAN_FIT_NOTE[c["planFit"]]

    # ---------- 반복 주제 5개 ----------
    themes = []
    for t in research["commentThemes"]:
        recs = by_theme.get(t["id"], [])
        copy = THEME_COPY[t["id"]]
        themes.append({
            "id": t["id"],
            "title": t["title"],
            "count": t["evidenceCount"],
            "platformCounts": t["platformEvidenceCounts"],
            "sharePct": t["sharePct"],
            "plainSummary": copy["plainSummary"],
            "responseSummary": copy["responseSummary"],
            "interpretationBoundary": copy["interpretationBoundary"],
            "nextQuestion": copy["nextQuestion"],
            "cardType": t["cardType"],
            "cardTitle": t["cardTitle"],
            "isBrandStage": t["id"] == "T05",
            "evidenceIds": [r["id"] for r in recs],
            "contentTitles": sorted({r["contentTitle"] for r in recs}),
        })

    # ---------- 페르소나 4명 + 브랜드 응대 단계 ----------
    def pick_evidence(theme_id, limit=5):
        recs = by_theme.get(theme_id, [])
        # 근거로서의 설명력 점수. 문장이 길수록, 키워드 신호가 잡힐수록, 공감이 많을수록 대표성이 크다.
        # T04는 이모지·짧은 감탄 자체가 신호이므로 길이 가중치를 낮춘다.
        length_weight = 0.4 if theme_id == "T04" else 1.0

        def score(r):
            base = (
                min(r["textLength"], 120) * length_weight
                + len(r["keywordGroups"]) * 12
                + r["likesNum"] * 3
            )
            # "와우"처럼 5자 미만인 감탄은 판단·검증 근거로 대표성이 없다.
            # 감탄 자체가 신호인 T04에서만 그대로 인정한다.
            if theme_id != "T04" and r["textLength"] < 5:
                base -= 40
            return base

        ranked = sorted(recs, key=lambda r: -score(r))
        picked, used = [], set()
        for r in ranked:
            if r["contentId"] in used and len(picked) < limit:
                continue
            picked.append(r)
            used.add(r["contentId"])
            if len(picked) == limit:
                break
        for r in ranked:
            if len(picked) == limit:
                break
            if r not in picked:
                picked.append(r)
        return [r["id"] for r in picked[:limit]]

    personas = []
    for t in research["commentThemes"]:
        p = t.get("persona")
        if not p:
            continue
        recs = by_theme.get(t["id"], [])
        observed = Counter()
        visibility = Counter()
        for r in recs:
            for o in r["observedThemes"]:
                observed[o] += 1
            if r["profileVisibility"]:
                visibility[r["profileVisibility"]] += 1
        copy = PERSONA_COPY[t["id"]]
        personas.append({
            "id": t["id"],
            "label": copy["label"],
            "nickname": copy["nickname"],
            "oneLine": copy["oneLine"],
            "themeTitle": t["title"],
            "count": t["evidenceCount"],
            "sharePct": t["sharePct"],
            "platformCounts": t["platformEvidenceCounts"],
            "demographics": copy["demographics"],
            "demographicBasis": copy["demographicBasis"],
            "currentContext": copy["currentContext"],
            "mainPain": copy["mainPain"],
            "desiredChange": copy["desiredChange"],
            "searches": copy["searches"],
            "contentHypothesis": p["contentHypothesis"],
            "observedProfileThemes": observed.most_common(8),
            "profileVisibility": dict(visibility),
            "evidenceIds": pick_evidence(t["id"]),
            "allEvidenceIds": [r["id"] for r in recs],
            "keywordGroups": sorted({g for r in recs for g in r["keywordGroups"]}),
        })

    # 화면 노출 순서를 PERSONA_ORDER로 맞춘다. 사업 연결이 가장 직접적인 것이 앞에 온다.
    personas.sort(key=lambda x: PERSONA_ORDER.index(x["id"]))

    brand_stage = next(t for t in research["commentThemes"] if t["id"] == "T05")
    brand_stage_block = {
        "id": "T05",
        "title": brand_stage["cardTitle"],
        "count": brand_stage["evidenceCount"],
        "plainSummary": THEME_COPY["T05"]["plainSummary"],
        "responseSummary": THEME_COPY["T05"]["responseSummary"],
        "interpretationBoundary": THEME_COPY["T05"]["interpretationBoundary"],
        "nextQuestion": THEME_COPY["T05"]["nextQuestion"],
        "evidenceIds": [r["id"] for r in by_theme.get("T05", [])],
    }

    # ---------- 키워드 집계 ----------
    keyword_stats = []
    for group in KEYWORD_GROUPS:
        matched = [r for r in records if group["id"] in r["keywordGroups"]]
        theme_mix = Counter(r["themeId"] for r in matched)
        keyword_stats.append({
            "id": group["id"],
            "label": group["label"],
            "meaning": KEYWORD_MEANING[group["id"]],
            "terms": group["terms"],
            "count": len(matched),
            "evidenceIds": [r["id"] for r in matched],
            "themeMix": dict(theme_mix),
        })
    keyword_stats.sort(key=lambda g: -g["count"])

    # ---------- 콘텐츠 기획안 10개 ----------
    # 기획안은 페르소나(댓글 근거) × 빌드블럭 사업 트랙으로 짜고,
    # 참고 레퍼런스는 2026-08-10에 웹에서 확인한 실제 채널·방송을 붙인다.
    persona_names = {p["id"]: p["nickname"] for p in personas}
    plans = []
    for idx, plan in enumerate(PLANS, start=1):
        refs = [dict(REFERENCES[r], id=r) for r in plan["references"]]
        plans.append({
            "no": f"{idx:02d}",
            "id": plan["id"],
            "title": plan["title"],
            "subtitle": plan["subtitle"],
            "personaIds": plan["personaIds"],
            "personaNames": [persona_names[pid] for pid in plan["personaIds"]],
            "personaWhy": plan["personaWhy"],
            "businessTrack": plan["businessTrack"],
            "businessWhy": plan["businessWhy"],
            "intent": plan["intent"],
            # 이 화면은 시리즈를 고르는 데까지만 쓴다. 회차 구성과 리스크는
            # 확정 기획안(별도 산출물)에서 다루므로 여기서는 싣지 않는다.
            "expectedEffect": plan["expectedEffect"][:2],
            "format": plan["format"],
            "repeatFormat": plan["repeatFormat"],
            "badge": plan["badge"],
            "recommended": plan.get("recommended", False),
            "recommendReason": plan.get("recommendReason", ""),
            "references": refs,
            "evidenceIds": sorted(
                {r["id"] for pid in plan["personaIds"] for r in by_theme.get(pid, [])}
            ),
        })

    reference_library = [dict(v, id=k) for k, v in REFERENCES.items()]

    # ---------- 플랫폼별 세부 페르소나 10개 ----------
    platform_personas = {"instagram": [], "youtube": []}
    for key in ("instagram", "youtube"):
        for p in research["personas"][key]:
            linked = [r["id"] for r in records if p["id"] in r["personaIds"]]
            platform_personas[key].append({
                "id": p["id"],
                "title": p["title"],
                "confidence": p["confidence"],
                "directSignal": p["directSignal"],
                "interests": p["interests"],
                "reasonToReact": p["reasonToReact"],
                "hypothesis": p["hypothesis"],
                "evidenceCount": p["evidenceCount"],
                "basicProfile": p["basicProfile"],
                "currentSituation": p["currentSituation"],
                "mainPain": p["mainPain"],
                "desiredChange": p["desiredChange"],
                "searchQueries": p["searchQueries"],
                "evidenceIds": linked,
            })

    ig_reels_total = len(reels)
    ig_reels_with_comments = sum(1 for r in reels.values() if int(r["comments"]) > 0)

    data = {
        "meta": {
            "title": "빌드블럭 릴스·유튜브 댓글 페르소나 분석",
            "question": INTRO_COPY["question"],
            "personaSectionNote": INTRO_COPY["personaSectionNote"],
            "collectedOn": COLLECTED_ON,
            "generatedFrom": "공개 화면에서 수집한 릴스·영상 지표와 공개 댓글을 재구성",
            "handlingNote": "본문의 댓글 작성 계정은 A001 형식으로 마스킹했습니다. 화면 캡처에는 실제 계정명이 남아 있으므로 공개 배포 시 scripts/strip_captures.py로 제거합니다.",
        },
        "metrics": {
            "contentsAnalyzed": len(contents),
            "igReelsWithComments": ig_reels_with_comments,
            "igReelsTotal": ig_reels_total,
            "ytVideosWithComments": sum(1 for c in contents if c["platform"] == "YouTube"),
            "ytVideosTotal": len(research["youtubeVideos"]),
            "commentsVerified": len(records),
            "externalComments": sum(1 for r in records if not r["isBrandReply"]),
            "brandReplies": sum(1 for r in records if r["isBrandReply"]),
            "themes": len([t for t in themes]),
            "personas": len(personas),
            "accounts": len({r["authorLabel"] for r in records if r["platform"] == "Instagram" and not r["isBrandReply"]}),
            "publicProfiles": sum(1 for p in profiles.values() if p["visibility"] == "공개"),
            "privateProfiles": sum(1 for p in profiles.values() if p["visibility"] == "비공개"),
            "screenshots": sum(1 for r in records if r["screenshot"]),
        },
        "methodSteps": METHOD_STEPS,
        "keywordGroups": keyword_stats,
        "contents": contents,
        "themes": themes,
        "personas": personas,
        "brandStage": brand_stage_block,
        "platformPersonas": platform_personas,
        "plans": plans,
        "pick": dict(PICK, plan=[p for p in plans if p["id"] == PICK["planId"]][0]),
        "referenceLibrary": reference_library,
        "records": records,
        "scopeNotes": {
            "metricScope": research["strategy"]["metricScope"],
        },
    }

    out = OUT_DIR / "data/report-data.js"
    out.write_text(
        "window.BB = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n",
        encoding="utf-8",
    )

    print(f"[OK] {out.relative_to(OUT_DIR)} ({out.stat().st_size:,} bytes)")
    print(f"  콘텐츠 {len(contents)}건 (IG {sum(1 for c in contents if c['platform']=='Instagram')} / YT {sum(1 for c in contents if c['platform']=='YouTube')})")
    print(f"  댓글 {len(records)}건 (외부 {data['metrics']['externalComments']} / 공식답글 {data['metrics']['brandReplies']})")
    print(f"  페르소나 {len(personas)}명 + 브랜드 응대 단계 1 / 플랫폼 세부 {len(platform_personas['instagram'])+len(platform_personas['youtube'])}")
    print(f"  키워드 그룹 {len(keyword_stats)} / 기획안 {len(plans)}")
    print(f"  캡처 연결 {data['metrics']['screenshots']}건")
    for g in keyword_stats:
        print(f"    {g['id']} {g['label']}: {g['count']}건")


if __name__ == "__main__":
    build()
