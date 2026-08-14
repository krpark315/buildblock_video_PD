/* 빌드블럭 댓글 페르소나 분석 — 렌더링 공통 스크립트
   메인 리포트(index.html)와 댓글 원문 아카이브(archive/index.html)가 함께 쓴다. */
(function () {
  "use strict";

  var BB = window.BB;
  if (!BB) return;

  // 아카이브는 한 단계 아래 폴더라 자산 경로 접두사가 다르다.
  var ROOT = document.body.dataset.root || ".";
  var RECORDS = {};
  BB.records.forEach(function (r) { RECORDS[r.id] = r; });
  var THEMES = {};
  BB.themes.forEach(function (t) { THEMES[t.id] = t; });
  var CONTENTS = {};
  BB.contents.forEach(function (c) { CONTENTS[c.id] = c; });

  var SEARCH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
  var ARROW_ICON = '<div class="ba-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></div>';

  // 공개 배포본은 캡처를 빼고 올린다(strip_captures.py). 그때는 검증 문구를 링크 기준으로 바꾼다.
  var HAS_SHOTS = !BB.meta.capturesStripped;

  var THEME_COLOR = { T01: "#2563eb", T02: "#0d7d6f", T03: "#b45309", T04: "#9333ea", T05: "#5b6472" };

  /* ---------- 유틸 ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // 먼저 이스케이프한 뒤 **강조**만 되살린다. 원문에 태그가 있어도 살아나지 않는다.
  function escBold(s) {
    return esc(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function num(n) { return n == null ? "—" : Number(n).toLocaleString("ko-KR"); }
  function platClass(p) { return p === "Instagram" ? "ig" : "yt"; }
  function thumbSrc(file) { return ROOT + "/assets/thumbs/" + file; }
  function shotSrc(file) { return ROOT + "/assets/comments/" + file; }
  function themeChip(id) {
    var t = THEMES[id];
    return '<span class="chip t-' + id + '">' + id + " " + esc(t ? t.title : "") + "</span>";
  }
  function platChip(p) {
    return '<span class="chip ' + platClass(p) + '">' + (p === "Instagram" ? "릴스" : "YouTube") + "</span>";
  }

  /* ---------- 라이트박스: 댓글 캡처 검증 ---------- */
  var lb = $("#lightbox");
  function openShot(id) {
    var r = RECORDS[id];
    if (!r || !lb) return;
    var c = CONTENTS[r.contentId] || {};
    $("#lb-info").innerHTML =
      "<h3>" + esc(r.id) + " 캡처 검증 · " + esc(r.contentTitle) + "</h3>" +
      "<p>" + platChip(r.platform) + " " + themeChip(r.themeId) +
        (r.authorLabel ? ' <span class="author' + (r.isBrandReply ? " brand" : "") + '">' + esc(r.authorLabel) + "</span>" : "") +
      "</p>" +
      '<div class="quote">' + esc(r.text) + "</div>" +
      "<p style='margin-top:8px'>" +
        (r.permalink ? '<a href="' + esc(r.permalink) + '" target="_blank" rel="noopener noreferrer">댓글 원본 링크</a> · ' : "") +
        '<a href="' + esc(r.contentUrl) + '" target="_blank" rel="noopener noreferrer">게시물 원본</a>' +
        " · 수집일 " + esc(r.collectedOn) +
        (r.likes ? " · 좋아요 " + esc(r.likes) : "") +
        (r.timeLabel ? " · 작성 " + esc(r.timeLabel) + " 전" : "") +
      "</p>";
    var img = $("#lb-img");
    img.src = shotSrc(r.screenshot);
    img.alt = r.id + " 댓글이 " + r.contentTitle + " 게시물에 달린 화면 캡처";
    $("#lb-hash").textContent = r.screenshotSha256
      ? "캡처 SHA-256 " + r.screenshotSha256
      : "";
    lb.classList.add("is-open");
    document.body.style.overflow = "hidden";
    $("#lb-close").focus();
  }
  function closeShot() {
    if (!lb) return;
    lb.classList.remove("is-open");
    $("#lb-img").src = "";
    document.body.style.overflow = "";
  }
  if (lb) {
    $("#lb-close").addEventListener("click", closeShot);
    lb.addEventListener("click", function (e) { if (e.target === lb) closeShot(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeShot(); });
  }
  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-shot]");
    if (btn) { e.preventDefault(); openShot(btn.dataset.shot); }
  });

  /* ---------- 근거 댓글 카드 ---------- */
  function evidenceCard(id) {
    var r = RECORDS[id];
    if (!r) return "";
    var kw = (r.keywordGroups || []).map(function (g) {
      var grp = BB.keywordGroups.filter(function (x) { return x.id === g; })[0];
      return '<span class="chip">' + esc(grp ? grp.label : g) + "</span>";
    }).join("");
    return (
      '<article class="ev-card">' +
        '<div class="ev-top"><span class="ev-id">' + esc(r.id) + "</span>" + platChip(r.platform) + kw + "</div>" +
        '<p class="ev-text">' + esc(r.text) + "</p>" +
        '<p class="ev-src">' +
          "달린 곳: <b>" + esc(r.contentTitle) + "</b>" +
          (r.authorLabel ? " · " + esc(r.authorLabel) : "") +
          (r.likesNum ? " · 좋아요 " + r.likesNum : "") +
        "</p>" +
        '<div class="ev-actions">' +
          (r.screenshot ? '<button class="ev-btn verify" data-shot="' + esc(r.id) + '">캡처 검증</button>' : "") +
          '<a class="ev-btn" href="' + esc(r.contentUrl) + '" target="_blank" rel="noopener noreferrer">게시물 열기</a>' +
          (r.permalink ? '<a class="ev-btn" href="' + esc(r.permalink) + '" target="_blank" rel="noopener noreferrer">댓글 링크</a>' : "") +
        "</div>" +
      "</article>"
    );
  }

  /* ================= 메인 리포트 ================= */
  function renderHome() {
    var m = BB.metrics;

    $("#hero-question").textContent = BB.meta.question;
    $("#hero-scope").innerHTML =
      "Instagram 릴스 <b>" + m.igReelsTotal + "편 중 댓글이 달린 " + m.igReelsWithComments + "편</b>, " +
      "YouTube <b>" + m.ytVideosTotal + "편 중 댓글이 달린 " + m.ytVideosWithComments + "편</b>이 대상입니다. " +
      "확인한 댓글은 외부 작성자 " + m.externalComments + "건과 빌드블럭 공식 답글 " + m.brandReplies + "건입니다.";

    var metrics = [
      { v: m.contentsAnalyzed, u: "편", l: "분석 콘텐츠", n: "릴스 " + m.igReelsWithComments + "편 + YouTube " + m.ytVideosWithComments + "편" },
      { v: m.commentsVerified, u: "건", l: "확인한 댓글", n: "외부 " + m.externalComments + " · 공식 답글 " + m.brandReplies },
      { v: m.themes, u: "개", l: "반복 주제", n: "댓글 1건당 대표 주제 1개만 배정" },
      { v: m.personas, u: "명", l: "도출 페르소나", n: "+ 브랜드 공식 응대 단계 1" },
      { v: m.accounts, u: "개", l: "댓글 계정", n: "공개 " + m.publicProfiles + " · 비공개 " + m.privateProfiles },
      HAS_SHOTS
        ? { v: m.screenshots, u: "장", l: "검증 캡처", n: "모든 댓글이 화면 캡처로 연결됨" }
        : { v: m.commentsVerified, u: "건", l: "원본 링크", n: "모든 댓글이 게시물·댓글 링크로 연결됨" }
    ];
    $("#metrics").innerHTML = metrics.map(function (x) {
      return '<div class="metric"><div class="metric-value">' + x.v + "<small>" + x.u + "</small></div>" +
        '<div class="metric-label">' + x.l + '</div><div class="metric-note">' + esc(x.n) + "</div></div>";
    }).join("");

    $("#archive-desc").textContent =
      "댓글 " + m.commentsVerified + "건의 원문, 달린 게시물, 주제 분류" + (HAS_SHOTS ? ", 화면 캡처" : "") + "를 한 화면에서 검색·정렬할 수 있습니다. " +
      "페르소나와 키워드 사전에서 넘어오면 해당 댓글만 걸러서 열립니다.";

    renderContents();
    renderThemes();
    renderMethod();
    renderPersonas();
    renderPlans();
    renderContentTable();
    setupNavHighlight();
  }

  /* ---------- 01 분석 콘텐츠 ---------- */
  function renderContents() {
    var filters = [
      { id: "all", label: "전체 " + BB.contents.length },
      { id: "Instagram", label: "Instagram 릴스 " + BB.contents.filter(function (c) { return c.platform === "Instagram"; }).length },
      { id: "YouTube", label: "YouTube " + BB.contents.filter(function (c) { return c.platform === "YouTube"; }).length }
    ];
    $("#content-filter").innerHTML = filters.map(function (f, i) {
      return '<button class="filter-btn' + (i === 0 ? " is-active" : "") + '" data-cf="' + f.id + '">' + esc(f.label) + "</button>";
    }).join("");

    draw("all");
    $("#content-filter").addEventListener("click", function (e) {
      var b = e.target.closest("[data-cf]");
      if (!b) return;
      Array.prototype.forEach.call(this.children, function (x) { x.classList.remove("is-active"); });
      b.classList.add("is-active");
      draw(b.dataset.cf);
    });

    function draw(kind) {
      var list = BB.contents.filter(function (c) { return kind === "all" || c.platform === kind; });
      $("#content-grid").innerHTML = list.map(function (c) {
        var cls = platClass(c.platform);
        var stats = [];
        if (c.views) stats.push("조회 " + num(c.views));
        if (c.likes) stats.push("좋아요 " + num(c.likes));
        if (c.durationSec) stats.push(Math.round(c.durationSec) + "초");
        if (c.duration) stats.push(c.duration);
        return (
          '<article class="content-card">' +
            '<div class="thumb-wrap ' + cls + '">' +
              '<img src="' + thumbSrc(c.thumb) + '" alt="' + esc(c.title) + ' 썸네일" loading="lazy">' +
              '<span class="thumb-badge ' + cls + '">' + (c.platform === "Instagram" ? "릴스" : "YouTube") + "</span>" +
              '<span class="thumb-count">댓글 ' + c.sampled + "</span>" +
            "</div>" +
            '<div class="content-body">' +
              '<h3 class="content-title"><a href="' + esc(c.url) + '" target="_blank" rel="noopener noreferrer">' + esc(c.title) + "</a></h3>" +
              '<div class="chip-row">' + themeChip(c.dominantTheme) + "</div>" +
              '<div class="content-stats">' + stats.map(function (s) { return "<span>" + esc(s) + "</span>"; }).join("") + "</div>" +
            "</div>" +
          "</article>"
        );
      }).join("");
    }
  }

  /* ---------- 02 반복 주제 ---------- */
  function renderThemes() {
    var total = BB.themes.reduce(function (a, t) { return a + t.count; }, 0);
    $("#dist-bar").innerHTML = BB.themes.map(function (t) {
      var pct = (t.count / total) * 100;
      return '<button class="dist-seg" style="flex:' + t.count + ';background:' + THEME_COLOR[t.id] + '" ' +
        'data-goto-theme="' + t.id + '" title="' + esc(t.title) + " " + t.count + '건">' +
        (pct > 11 ? t.id + " " + t.count + "건" : t.count) + "</button>";
    }).join("");
    $("#dist-legend").innerHTML = BB.themes.map(function (t) {
      return "<span><i class='dot' style='background:" + THEME_COLOR[t.id] + "'></i>" +
        esc(t.id + " " + t.title) + " · " + t.count + "건 (" + t.sharePct + "%)</span>";
    }).join("");

    $("#theme-grid").innerHTML = BB.themes.map(function (t) {
      var plats = Object.keys(t.platformCounts).map(function (k) {
        return '<span class="chip ' + (k === "Instagram" ? "ig" : "yt") + '">' + (k === "Instagram" ? "릴스" : "YouTube") + " " + t.platformCounts[k] + "</span>";
      }).join("");
      return (
        '<article class="theme-card" data-theme="' + t.id + '" id="theme-' + t.id + '">' +
          '<div class="theme-top"><h3>' + esc(t.id + ". " + t.title) + "</h3>" +
            '<span class="theme-count"><b>' + t.count + "</b>건 · " + t.sharePct + "%</span></div>" +
          '<div class="chip-row">' + plats + (t.isBrandStage ? '<span class="chip">사람 아님 · 응대 단계</span>' : "") + "</div>" +
          '<div class="field"><span class="field-label">어떤 댓글인가</span><p class="field-body">' + esc(t.plainSummary) + "</p></div>" +
          '<div class="field"><span class="field-label">이 반응을 어떻게 읽는가</span><p class="field-body">' + esc(t.responseSummary) + "</p></div>" +
          '<div class="field"><span class="field-label">해석의 경계</span><p class="field-body" style="font-size:13px;color:var(--text-dim)">' + esc(t.interpretationBoundary) + "</p></div>" +
          '<div class="field"><span class="field-label">다음 회차가 답할 질문</span><p class="field-body"><strong>' + esc(t.nextQuestion) + "</strong></p></div>" +
          '<div class="ev-actions"><a class="ev-btn" href="' + ROOT + "/archive/?theme=" + t.id + '">이 주제 댓글 ' + t.count + "건 보기 →</a></div>" +
        "</article>"
      );
    }).join("");

    $("#dist-bar").addEventListener("click", function (e) {
      var b = e.target.closest("[data-goto-theme]");
      if (b) document.getElementById("theme-" + b.dataset.gotoTheme).scrollIntoView({ block: "center" });
    });
  }

  /* ---------- 03 분석 방법 ---------- */
  function renderMethod() {
    $("#method-flow").innerHTML = BB.methodSteps.map(function (s) {
      return (
        '<div class="method-step">' +
          '<span class="num">STEP ' + s.step + "</span>" +
          "<h3>" + esc(s.title) + "</h3>" +
          "<p>" + esc(s.body) + "</p>" +
          '<div class="example"><b>예</b> ' + esc(s.example) + "</div>" +
        "</div>"
      );
    }).join("");

    $("#kw-body").innerHTML = BB.keywordGroups.map(function (g) {
      return (
        "<tr>" +
          "<td><strong>" + esc(g.id + " " + g.label) + "</strong></td>" +
          "<td>" + esc(g.meaning) + "</td>" +
          '<td><div class="term-list">' + g.terms.slice(0, 9).map(function (t) {
            return '<span class="term">' + esc(t) + "</span>";
          }).join("") + (g.terms.length > 9 ? '<span class="term">외 ' + (g.terms.length - 9) + "</span>" : "") + "</div></td>" +
          '<td class="num"><a href="' + ROOT + "/archive/?kw=" + g.id + '">' + g.count + "건 →</a></td>" +
        "</tr>"
      );
    }).join("");

  }

  /* ---------- 04 페르소나 ---------- */
  function renderPersonas() {
    $("#persona-note").textContent = BB.meta.personaSectionNote;

    $("#persona-list").innerHTML = BB.personas.map(function (p, i) {
      var color = THEME_COLOR[p.id];
      var observed = p.observedProfileThemes.length
        ? p.observedProfileThemes.map(function (o) {
            return '<span class="chip">' + esc(o[0]) + " " + o[1] + "</span>";
          }).join("")
        : '<span class="chip">공개 피드에서 관찰된 주제 없음</span>';
      var vis = Object.keys(p.profileVisibility).map(function (k) {
        return esc(k) + " " + p.profileVisibility[k];
      }).join(" · ");

      return (
        '<article class="persona-card" id="persona-' + p.id + '">' +
          '<div class="persona-head">' +
            '<div class="persona-avatar" style="background:' + color + '">P' + (i + 1) + "</div>" +
            "<div>" +
              '<div class="persona-label">' + esc(p.label) + "</div>" +
              "<h3>" + esc(p.nickname) + "</h3>" +
              '<div class="sub">' + esc(p.id + " · " + p.themeTitle) + "</div>" +
            "</div>" +
            '<div class="stat"><b>' + p.count + "</b><span>근거 댓글 · 전체의 " + p.sharePct + "%</span>" +
              '<a class="stat-jump" href="#evidence-' + p.id + '">근거 ' + p.count + "건 확인 ↓</a></div>" +
          "</div>" +

          '<p class="persona-oneline">' + esc(p.oneLine) + "</p>" +

          '<div class="persona-body">' +
            '<div class="persona-fields">' +
              numField("2", "기본 프로필", p.demographics, "가설") +
              '<details class="basis"><summary>근거 댓글 보기</summary><p>' +
                esc(p.demographicBasis) + "</p></details>" +
              '<div class="field"><span class="field-label">공개 프로필에서 실제로 관찰된 활동 주제</span>' +
                '<div class="chip-row" style="margin-top:5px">' + observed + "</div>" +
                '<p class="field-body" style="font-size:12.5px;color:var(--text-dim);margin-top:6px">이 페르소나로 묶인 계정의 공개 상태: ' + vis + "</p></div>" +
              numField("3", "현재 상황", p.currentContext, "") +
            "</div>" +

            '<div class="persona-side">' +
              '<div class="flow"><div class="flow-title">문제 → 욕구 → 검색 행동</div><div class="flow-steps">' +
                flowStep("4. 주요 고민 · 고통", p.mainPain, color, "4", false) +
                flowStep("5. 가장 바라는 변화", p.desiredChange, color, "5", false) +
                flowStep("6. 실제로 검색할 만한 질문", "이 사람이 위 상태에서 검색창에 그대로 입력할 문장 3개입니다.", color, "6", true) +
              "</div>" +
              '<div class="search-list" style="margin-top:12px">' + p.searches.map(function (q) {
                return '<div class="search-item"><span class="search-icon">' + SEARCH_ICON + "</span><span>" + esc(q) + "</span></div>";
              }).join("") + "</div></div>" +
              field("이 페르소나를 위한 콘텐츠 가설", p.contentHypothesis) +
            "</div>" +
          "</div>" +

          '<div class="evidence-block" id="evidence-' + p.id + '">' +
            '<div class="evidence-head"><h4>이 페르소나가 나온 댓글 ' + p.evidenceIds.length + "건 · " + (HAS_SHOTS ? "캡처로 확인 가능" : "원본 링크로 확인 가능") + "</h4>" +
              '<span class="count">묶인 전체 ' + p.count + "건 중 신호가 가장 뚜렷한 " + p.evidenceIds.length + "건</span>" +
              '<a class="ev-btn" style="margin-left:auto" href="' + ROOT + "/archive/?theme=" + p.id + '">전체 ' + p.count + "건 보기 →</a>" +
            "</div>" +
            '<div class="evidence-grid">' + p.evidenceIds.map(evidenceCard).join("") + "</div>" +
          "</div>" +
        "</article>"
      );
    }).join("");

    var b = BB.brandStage;
    $("#brand-stage").innerHTML =
      '<article class="persona-card" style="margin-top:20px">' +
        '<div class="persona-head">' +
          '<div class="persona-avatar" style="background:' + THEME_COLOR.T05 + '">B</div>' +
          "<div>" +
            '<div class="persona-label">사람 페르소나 아님</div>' +
            "<h3>" + esc(b.title) + "</h3>" +
            '<div class="sub">T05 · 빌드블럭 공식 계정이 시청자 질문에 답한 대화 단계</div></div>' +
          '<div class="stat"><b>' + b.count + "</b><span>공식 답글</span></div>" +
        "</div>" +
        '<div class="persona-body" style="grid-template-columns:1fr">' +
          '<div class="persona-fields">' +
            field("빌드블럭이 어떤 질문에 어떻게 답했는가", b.plainSummary) +
            field("이 답글에서 확인되는 것", b.responseSummary) +
            field("이 단계를 읽을 때의 주의점", b.interpretationBoundary) +
            field("다음에 고정할 것", b.nextQuestion) +
          "</div>" +
        "</div>" +
        '<div class="evidence-block"><div class="evidence-head"><h4>공식 답글 ' + b.count + "건</h4></div>" +
          '<div class="evidence-grid">' + b.evidenceIds.map(evidenceCard).join("") + "</div></div>" +
      "</article>";

    var subs = BB.platformPersonas.instagram.concat(BB.platformPersonas.youtube);
    $("#sub-persona-grid").innerHTML = subs.map(function (p) {
      return (
        '<div class="sub-persona">' +
          "<h4>" + esc(p.title) + "</h4>" +
          '<div class="meta"><span class="chip ' + (p.id.indexOf("IG") === 0 ? "ig" : "yt") + '">' + esc(p.id) + "</span>" +
            '<span class="chip">근거 ' + p.evidenceCount + "건</span>" +
            '<span class="chip">확신도 ' + esc(p.confidence) + "</span></div>" +
          "<p><b>이 시청자가 겪는 문제</b><br>" + esc(p.mainPain) + "</p>" +
          "<p><b>이 시청자가 원하는 것</b><br>" + esc(p.desiredChange) + "</p>" +
          "<p style='color:var(--text-dim);font-size:12.5px'><b>이 시청자가 검색할 문장</b></p>" +
          '<p class="q">' + esc(p.searchQueries[0]) + "</p>" +
          (p.evidenceIds.length ? '<div class="ev-actions" style="margin-top:9px"><a class="ev-btn" href="' + ROOT + "/archive/?ids=" + p.evidenceIds.join(",") + '">근거 댓글 ' + p.evidenceIds.length + "건 →</a></div>" : "") +
        "</div>"
      );
    }).join("");

    function field(label, body) {
      return '<div class="field"><span class="field-label">' + esc(label) + '</span><p class="field-body">' + esc(body) + "</p></div>";
    }
    // 사용자가 요청한 6개 항목은 번호를 붙여 어떤 항목인지 바로 보이게 한다.
    function numField(n, label, body, tag) {
      return '<div class="field"><span class="field-label"><i class="fn">' + n + "</i>" + esc(label) +
        (tag ? '<em class="tag">' + esc(tag) + "</em>" : "") +
        '</span><p class="field-body">' + esc(body) + "</p></div>";
    }
    function flowStep(kind, body, color, n, last) {
      return (
        '<div class="flow-step"><div class="flow-rail">' +
          '<div class="flow-node" style="background:' + color + '">' + n + "</div>" +
          (last ? "" : '<div class="flow-line"></div>') +
        '</div><div class="flow-text"><div class="flow-kind">' + esc(kind) + '</div>' +
        '<div class="flow-body">' + esc(body) + "</div></div></div>"
      );
    }
  }

  /* ---------- 05 기획안 ---------- */
  function renderPlans() {
    renderReferenceLibrary();

    var k = BB.pick;
    var p = k.plan;
    var $p = $("#pick-body");
    if (!$p) return;

    function block(label, inner) {
      return '<div class="pick-block"><h3 class="pick-h">' + esc(label) + "</h3>" + inner + "</div>";
    }

    var html = "";

    // 헤더
    html +=
      '<div class="pick-head">' +
        '<div class="pick-top">' +
          '<span class="plan-no">' + esc(p.no) + "</span>" +
          "<h3>" + esc(k.title) + "</h3>" +
          '<span class="plan-badge rec">' + esc(k.status) + "</span>" +
        "</div>" +
        '<p class="pick-sub">' + esc(k.subtitle) + "</p>" +
        '<div class="pick-meta">' +
          "<span><b>대상</b> " + p.personaNames.map(esc).join(" · ") + "</span>" +
          "<span><b>사업</b> " + esc(p.businessTrack) + "</span>" +
          "<span><b>포맷</b> " + esc(p.format) + "</span>" +
        "</div>" +
      "</div>";

    // 왜 이걸 골랐나
    html += block("이 시리즈를 고른 이유",
      '<div class="why-grid">' + k.whyPicked.map(function (w) {
        return '<div class="why-card"><h4>' + esc(w.label) + "</h4><p>" + esc(w.body) + "</p></div>";
      }).join("") + "</div>");

    // 1단계 관찰
    html += block("1단계 · 관찰에서 출발한다",
      '<div class="obs"><p class="obs-headline">' + esc(k.observation.headline) + "</p>" +
      '<p class="obs-body">' + escBold(k.observation.body) + "</p>" +
      "<ul class=\"obs-list\">" + k.observation.signals.map(function (x) {
        return "<li>" + esc(x) + "</li>";
      }).join("") + "</ul>" +
      '<p class="obs-note">' + esc(k.observation.evidenceNote) + "</p></div>");

    // 2단계 문제
    html += block("2단계 · 이 사람이 풀지 못하는 문제",
      '<div class="prob-grid">' + k.problems.map(function (x) {
        return '<div class="prob-card"><span class="prob-kind">' + esc(x.kind) + "</span>" +
          "<h4>" + esc(x.title) + "</h4><p>" + esc(x.body) + "</p></div>";
      }).join("") + "</div>");

    // 3단계 시청 동기
    var ba = k.watchMotivation.beforeAfter[0];
    html += block("3단계 · 그래서 이 영상을 왜 보는가",
      '<div class="motive">' +
        '<div class="motive-row"><span class="motive-label">언제 보는가</span><p>' + esc(k.watchMotivation.trigger) + "</p></div>" +
        '<div class="motive-row"><span class="motive-label">무엇을 하려고</span><p><strong>' + esc(k.watchMotivation.job) + "</strong></p></div>" +
        '<div class="ba"><div class="ba-cell"><span>보기 전</span><p>' + esc(ba.before) + "</p></div>" +
          ARROW_ICON +
          '<div class="ba-cell after"><span>보고 난 뒤</span><p>' + esc(ba.after) + "</p></div></div>" +
        '<div class="motive-row"><span class="motive-label">왜 다른 영상이 아니라 이것인가</span><p>' + escBold(k.watchMotivation.whyThisVideo) + "</p></div>" +
      "</div>");

    // 4단계 답할 질문
    html += block("4단계 · 영상이 반드시 답할 질문",
      "<ol class=\"must-list\">" + k.mustAnswer.map(function (x) {
        return "<li>" + esc(x) + "</li>";
      }).join("") + "</ol>");

    // 반복 틀
    html += block("무엇을 반복하는가",
      '<div class="repeat"><ol class="repeat-list">' + k.repeatFrame.fixed.map(function (x) {
        return "<li>" + esc(x) + "</li>";
      }).join("") + "</ol>" +
      '<p class="repeat-note">' + esc(k.repeatFrame.variable) + "</p></div>");

    // 레퍼런스
    html += block("참고 레퍼런스",
      '<div class="pick-refs">' + p.references.map(function (r) {
        return '<div class="ref-item"><div class="ref-top">' +
          '<span class="region-badge ' + (r.region === "한국" ? "kr" : "global") + '">' + esc(r.region) + "</span>" +
          '<span class="chip">' + esc(r.kind) + "</span></div>" +
          "<h4>" + esc(r.org) + " — <a href=\"" + esc(r.url) + "\" target=\"_blank\" rel=\"noopener noreferrer\">" + esc(r.channel) + "</a></h4>" +
          "<p>" + esc(r.fact) + "</p>" +
          '<p class="why"><b>빌드블럭에 어떻게 쓰나</b> ' + esc(r.takeaway) + "</p></div>";
      }).join("") + "</div>");

    // 열린 질문
    html += block("아직 정하지 못한 것",
      "<ul class=\"open-list\">" + k.openQuestions.map(function (x) {
        return "<li>" + esc(x) + "</li>";
      }).join("") + "</ul>" +
      '<p class="repeat-note">' + esc(k.nextStep) + "</p>");

    // 근거로 되돌아가기
    html += '<div class="pick-cta">' +
      '<a class="btn btn-primary" href="' + ROOT + "/archive/?ids=" + p.evidenceIds.join(",") +
      '">이 시리즈의 근거 댓글 ' + p.evidenceIds.length + "건 보기 →</a>" +
      '<a class="btn" href="#personas">대상 페르소나 다시 보기</a></div>';

    $p.innerHTML = html;
  }


  function renderReferenceLibrary() {
    var lib = BB.referenceLibrary;
    var kr = lib.filter(function (r) { return r.region === "한국"; }).length;
    $("#ref-summary").textContent =
      "확인한 레퍼런스 " + lib.length + "건 — 한국 " + kr + "건, 해외 " + (lib.length - kr) + "건. " +
      "모두 2026-08-10에 실제 채널·프로그램 정보를 확인했습니다.";
    $("#ref-body").innerHTML = lib.map(function (r) {
      return (
        "<tr>" +
          '<td><span class="region-badge ' + (r.region === "한국" ? "kr" : "global") + '">' + esc(r.region) + "</span></td>" +
          '<td><span class="chip">' + esc(r.kind) + "</span></td>" +
          "<td><strong>" + esc(r.org) + "</strong><br>" +
            '<a href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer">' + esc(r.channel) + "</a></td>" +
          "<td>" + esc(r.fact) + "</td>" +
          "<td>" + esc(r.takeaway) + "</td>" +
        "</tr>"
      );
    }).join("");
  }

  /* ---------- 06 영상별 분석 ---------- */
  function renderContentTable() {
    $("#content-table").innerHTML = BB.contents.map(function (c) {
      var cls = platClass(c.platform);
      var stats = [];
      if (c.views) stats.push("조회 " + num(c.views));
      if (c.likes) stats.push("좋아요 " + num(c.likes));
      var bar = BB.themes.filter(function (t) { return c.themeCounts[t.id]; }).map(function (t) {
        return "<i style='flex:" + c.themeCounts[t.id] + ";background:" + THEME_COLOR[t.id] + "'></i>";
      }).join("");
      var signals = Object.keys(c.themeCounts).sort(function (a, b) {
        return c.themeCounts[b] - c.themeCounts[a];
      }).map(function (id) {
        return '<span class="chip t-' + id + '">' + esc(THEMES[id].title) + " " + c.themeCounts[id] + "</span>";
      }).join("");

      return (
        "<tr>" +
          '<td><div class="tt-cell">' +
            '<img class="table-thumb ' + cls + '" src="' + thumbSrc(c.thumb) + '" alt="" loading="lazy">' +
            "<div><strong>" + esc(c.title) + "</strong><br>" + platChip(c.platform) +
              (c.topic ? ' <span class="chip">' + esc(c.topic) + "</span>" : "") + "</div>" +
          "</div></td>" +
          '<td class="num">' + stats.join("<br>") + "</td>" +
          '<td class="num">' + c.sampled + "건" +
            '<div class="mini-bar">' + bar + "</div></td>" +
          '<td><div class="chip-row">' + signals + "</div>" +
            '<p style="margin:7px 0 0;font-size:12.5px">' + esc(c.dominantResponse) + "</p></td>" +
          '<td><span class="fit-badge ' + c.planFit + '">' + c.planFit + "</span>" +
            '<p style="margin:7px 0 0;font-size:12.5px">' + esc(c.planFitNote) + "</p></td>" +
          '<td style="font-size:12.5px">' + esc(c.nextQuestion) + "</td>" +
        "</tr>"
      );
    }).join("");
  }

  /* ---------- 네비게이션 하이라이트 ---------- */
  function setupNavHighlight() {
    var links = Array.prototype.slice.call(document.querySelectorAll('.site-nav a[href^="#"]'));
    var sections = links.map(function (a) { return document.querySelector(a.getAttribute("href")); }).filter(Boolean);
    if (!("IntersectionObserver" in window) || !sections.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (a) {
          a.classList.toggle("is-active", a.getAttribute("href") === "#" + en.target.id);
        });
      });
    }, { rootMargin: "-70px 0px -65% 0px" });
    sections.forEach(function (s) { io.observe(s); });
  }

  /* ================= 아카이브 ================= */
  function renderArchive() {
    var params = new URLSearchParams(location.search);
    var preTheme = params.get("theme");
    var preKw = params.get("kw");
    var preContent = params.get("content");
    var preIds = params.get("ids") ? params.get("ids").split(",") : null;

    var themeSel = $("#f-theme");
    var contentSel = $("#f-content");
    var kwSel = $("#f-kw");
    var platSel = $("#f-platform");
    var sortSel = $("#f-sort");
    var q = $("#f-q");

    themeSel.innerHTML = '<option value="">주제 전체</option>' + BB.themes.map(function (t) {
      return '<option value="' + t.id + '">' + esc(t.id + " " + t.title) + " (" + t.count + ")</option>";
    }).join("");
    kwSel.innerHTML = '<option value="">키워드 신호 전체</option>' + BB.keywordGroups.map(function (g) {
      return '<option value="' + g.id + '">' + esc(g.label) + " (" + g.count + ")</option>";
    }).join("");
    contentSel.innerHTML = '<option value="">콘텐츠 전체</option>' + BB.contents.map(function (c) {
      return '<option value="' + esc(c.id) + '">' + esc((c.platform === "Instagram" ? "[릴스] " : "[YT] ") + c.title) + " (" + c.sampled + ")</option>";
    }).join("");

    if (preTheme) themeSel.value = preTheme;
    if (preKw) kwSel.value = preKw;
    if (preContent) contentSel.value = preContent;

    [themeSel, contentSel, kwSel, platSel, sortSel].forEach(function (el) {
      el.addEventListener("change", function () { preIds = null; draw(); });
    });
    q.addEventListener("input", function () { preIds = null; draw(); });
    $("#f-reset").addEventListener("click", function () {
      themeSel.value = ""; contentSel.value = ""; kwSel.value = ""; platSel.value = "";
      sortSel.value = "content"; q.value = ""; preIds = null;
      history.replaceState(null, "", location.pathname);
      draw();
    });

    draw();

    function draw() {
      var term = q.value.trim().toLowerCase();
      var list = BB.records.filter(function (r) {
        if (preIds && preIds.indexOf(r.id) === -1) return false;
        if (themeSel.value && r.themeId !== themeSel.value) return false;
        if (contentSel.value && r.contentId !== contentSel.value) return false;
        if (kwSel.value && (r.keywordGroups || []).indexOf(kwSel.value) === -1) return false;
        if (platSel.value && r.platform !== platSel.value) return false;
        if (term) {
          var hay = (r.text + " " + r.authorLabel + " " + r.contentTitle + " " + r.id).toLowerCase();
          if (hay.indexOf(term) === -1) return false;
        }
        return true;
      });

      var sort = sortSel.value;
      list.sort(function (a, b) {
        if (sort === "likes") return b.likesNum - a.likesNum || a.id.localeCompare(b.id);
        if (sort === "theme") return a.themeId.localeCompare(b.themeId) || a.id.localeCompare(b.id);
        if (sort === "length") return b.textLength - a.textLength;
        if (sort === "content") {
          var ca = CONTENTS[a.contentId], cb = CONTENTS[b.contentId];
          return (cb.sampled - ca.sampled) || a.contentId.localeCompare(b.contentId) || a.id.localeCompare(b.id);
        }
        return a.id.localeCompare(b.id);
      });

      $("#result-count").innerHTML = "<b>" + list.length + "</b> / " + BB.records.length + "건";
      if (preIds) {
        $("#filter-note").textContent = "특정 페르소나의 근거 댓글만 걸러서 보고 있습니다. 초기화를 누르면 전체로 돌아갑니다.";
        $("#filter-note").style.display = "";
      } else {
        $("#filter-note").style.display = "none";
      }

      if (!list.length) {
        $("#archive-list").innerHTML = '<div class="empty">조건에 맞는 댓글이 없습니다.</div>';
        return;
      }

      $("#archive-list").innerHTML = list.map(function (r) {
        var c = CONTENTS[r.contentId] || {};
        var cls = platClass(r.platform);
        var kw = (r.keywordGroups || []).map(function (g) {
          var grp = BB.keywordGroups.filter(function (x) { return x.id === g; })[0];
          return '<span class="chip">' + esc(grp ? grp.label : g) + "</span>";
        }).join("");
        return (
          '<article class="arch-item' + (r.isBrandReply ? " is-brand" : "") + '">' +
            '<img class="arch-thumb ' + cls + '" src="' + thumbSrc(r.thumb) + '" alt="" loading="lazy">' +
            '<div class="arch-main">' +
              '<div class="arch-meta">' +
                '<span class="ev-id">' + esc(r.id) + "</span>" + platChip(r.platform) + themeChip(r.themeId) + kw +
                (r.isBrandReply ? '<span class="chip" style="color:var(--ok)">빌드블럭 공식 답글</span>' : "") +
              "</div>" +
              '<p class="arch-text">' + esc(r.text) + "</p>" +
              '<p class="arch-src">' +
                '<span class="author' + (r.isBrandReply ? " brand" : "") + '">' + esc(r.authorLabel || "계정 미수집") + "</span>" +
                (r.profileVisibility ? " · " + esc(r.profileVisibility) : "") +
                (r.likes ? " · 좋아요 " + esc(r.likes) : "") +
                (r.timeLabel ? " · " + esc(r.timeLabel) + " 전" : "") +
                " · 달린 곳 <a href='" + esc(r.contentUrl) + "' target='_blank' rel='noopener noreferrer'>" + esc(r.contentTitle) + "</a>" +
                (r.observedThemes && r.observedThemes.length ? " · 공개 피드 주제: " + esc(r.observedThemes.join(", ")) : "") +
              "</p>" +
            "</div>" +
            '<div class="arch-actions">' +
              (r.screenshot ? '<button class="ev-btn verify" data-shot="' + esc(r.id) + '">캡처 검증</button>' : "") +
              (r.permalink ? '<a class="ev-btn" href="' + esc(r.permalink) + '" target="_blank" rel="noopener noreferrer">댓글 링크</a>' : "") +
            "</div>" +
          "</article>"
        );
      }).join("");
    }
  }

  /* ---------- 상단 이동 버튼 ---------- */
  (function () {
    var btn = $("#to-top");
    if (!btn) return;
    btn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    function sync() { btn.classList.toggle("is-visible", window.scrollY > 600); }
    window.addEventListener("scroll", sync, { passive: true });
    sync();
  })();

  /* ---------- 진입 ---------- */
  if (document.getElementById("persona-list")) renderHome();
  if (document.getElementById("archive-list")) renderArchive();
})();
