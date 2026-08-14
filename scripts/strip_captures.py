#!/usr/bin/env python3
"""공개 저장소용 — 댓글 화면 캡처를 제거한다.

캡처 이미지 안에는 실제 계정명과 프로필 사진이 남아 있다.
저장소를 공개로 둘 경우 이 스크립트를 실행하면
캡처 파일을 지우고, 데이터에서도 캡처 참조를 끊는다.

캡처를 빼도 댓글 원문·분류·근거 연결은 그대로 남고,
'캡처 검증' 버튼만 사라진다.
"""

import json
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
COMMENTS = ROOT / "assets/comments"
DATA = ROOT / "data/report-data.js"


def main():
    if not DATA.exists():
        raise SystemExit("data/report-data.js 가 없습니다.")

    raw = DATA.read_text(encoding="utf-8")
    payload = json.loads(raw.split("=", 1)[1].strip().rstrip(";"))

    removed = 0
    for rec in payload["records"]:
        if rec.get("screenshot"):
            removed += 1
        rec["screenshot"] = ""
        rec["screenshotSha256"] = ""

    payload["metrics"]["screenshots"] = 0
    payload["meta"]["capturesStripped"] = True
    payload["meta"].pop("internalOnly", None)
    payload["meta"]["handlingNote"] = (
        "공개 배포본입니다. 댓글 작성 계정은 A001 형식으로 마스킹했고 화면 캡처는 포함하지 않습니다. "
        "검증은 댓글 원문과 원본 게시물·댓글 링크로 합니다."
    )

    DATA.write_text(
        "window.BB = " + json.dumps(payload, ensure_ascii=False, indent=1) + ";\n",
        encoding="utf-8",
    )

    if COMMENTS.exists():
        files = len(list(COMMENTS.iterdir()))
        shutil.rmtree(COMMENTS)
        print(f"[OK] assets/comments/ 삭제 — 이미지 {files}장")
    else:
        print("[--] assets/comments/ 없음")

    print(f"[OK] 데이터에서 캡처 참조 {removed}건 제거")
    print("     댓글 원문·주제 분류·근거 연결은 그대로 남습니다.")
    print("     되돌리려면 원본 폴더에서 assets/comments/를 복사하고 build_data.py를 실행하세요.")


if __name__ == "__main__":
    main()
