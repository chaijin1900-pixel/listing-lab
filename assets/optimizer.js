(() => {
  "use strict";

  const MAX_INPUT_LENGTH = 3000;

  const form = document.querySelector("#optimizer-form");
  const listingInput = document.querySelector("#listing-input");
  const categoryInput = document.querySelector("#category-input");
  const keywordsInput = document.querySelector("#keywords-input");
  const charCount = document.querySelector("#char-count");
  const submitBtn = document.querySelector("#submit-btn");
  const message = document.querySelector("#message");
  const results = document.querySelector("#results");

  const titleBefore = document.querySelector("#title-before");
  const titleAfter = document.querySelector("#title-after");
  const titleRationale = document.querySelector("#title-rationale");
  const bulletsBefore = document.querySelector("#bullets-before");
  const bulletsAfter = document.querySelector("#bullets-after");
  const keywordsOut = document.querySelector("#keywords-out");
  const keywordsRationale = document.querySelector("#keywords-rationale");

  if (!form) return;

  function showMessage(text, kind) {
    message.textContent = text;
    message.className = "message" + (kind ? " " + kind : "");
    message.hidden = false;
  }

  function clearMessage() {
    message.hidden = true;
    message.textContent = "";
  }

  function updateCharCount() {
    const len = listingInput.value.length;
    if (len > MAX_INPUT_LENGTH) {
      // Enforce the 3000-character limit on the client and warn the user.
      listingInput.value = listingInput.value.slice(0, MAX_INPUT_LENGTH);
      showMessage(`已超过 ${MAX_INPUT_LENGTH} 字符上限，输入已自动截断。`, "error");
    }
    const current = listingInput.value.length;
    charCount.textContent = `${current} / ${MAX_INPUT_LENGTH}`;
    charCount.classList.toggle("limit", current >= MAX_INPUT_LENGTH);
  }

  listingInput.addEventListener("input", updateCharCount);

  // Split the raw listing into a title (first non-empty line) and bullet lines.
  function splitListing(raw) {
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*[-*•·]\s*/, "").trim())
      .filter(Boolean);
    if (lines.length === 0) return { title: "", bullets: [] };
    return { title: lines[0], bullets: lines.slice(1) };
  }

  function renderList(target, items, plain) {
    target.innerHTML = "";
    items.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      target.appendChild(li);
    });
    if (plain && items.length === 0) {
      const li = document.createElement("li");
      li.textContent = "（原文未提供五点描述）";
      target.appendChild(li);
    }
  }

  function renderResult(data, original) {
    titleBefore.textContent = original.title || "（原文未提供标题）";
    titleAfter.textContent = data.title_optimized;

    renderList(bulletsBefore, original.bullets, true);

    const rationale = data.rationale || {};
    const bulletReasons = Array.isArray(rationale.bullets) ? rationale.bullets : [];
    bulletsAfter.innerHTML = "";
    data.bullets_optimized.forEach((bullet, index) => {
      const li = document.createElement("li");
      li.textContent = bullet;
      const reason = bulletReasons[index];
      if (reason) {
        const span = document.createElement("span");
        span.className = "rationale";
        span.textContent = reason;
        li.appendChild(span);
      }
      bulletsAfter.appendChild(li);
    });

    if (rationale.title) {
      titleRationale.textContent = rationale.title;
      titleRationale.hidden = false;
    } else {
      titleRationale.hidden = true;
    }

    keywordsOut.innerHTML = "";
    data.keywords_suggested.forEach((keyword) => {
      const chip = document.createElement("span");
      chip.className = "keyword-chip";
      chip.textContent = keyword;
      keywordsOut.appendChild(chip);
    });

    if (rationale.keywords) {
      keywordsRationale.textContent = rationale.keywords;
      keywordsRationale.hidden = false;
    } else {
      keywordsRationale.hidden = true;
    }

    results.hidden = false;
    results.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage();

    const listing = listingInput.value.trim();
    if (!listing) {
      showMessage("请先粘贴需要优化的 Listing 内容。", "error");
      listingInput.focus();
      return;
    }
    if (listing.length > MAX_INPUT_LENGTH) {
      showMessage(`Listing 内容超过 ${MAX_INPUT_LENGTH} 字符上限。`, "error");
      return;
    }

    const original = splitListing(listing);

    submitBtn.disabled = true;
    submitBtn.textContent = "优化中…";
    showMessage("正在调用 DeepSeek 优化，请稍候…", null);

    try {
      const response = await fetch("/api/optimize-listing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          listing,
          category: categoryInput.value.trim(),
          keywords: keywordsInput.value.trim(),
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const text = payload && typeof payload.error === "string" ? payload.error : "优化失败，请稍后重试。";
        showMessage(text, "error");
        return;
      }

      renderResult(payload, original);
      showMessage("优化完成。", "success");
    } catch (error) {
      showMessage("网络错误，无法连接优化服务。", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "优化 Listing";
    }
  });

  updateCharCount();
})();
