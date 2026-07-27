const analyzerForm = document.querySelector("#analyzer-form");
const analyzerKeyword = document.querySelector("#analyzer-keyword");
const analyzerSubmit = document.querySelector("#analyzer-submit");
const analyzerMessage = document.querySelector("#analyzer-message");
const analyzerSummary = document.querySelector("#analyzer-summary");
const analyzerInsights = document.querySelector("#analyzer-insights");
const analyzerProducts = document.querySelector("#analyzer-products");
const analyzerResults = document.querySelector("#analyzer-results");
const analyzerResultCount = document.querySelector("#analyzer-result-count");
const analyzerTimestamp = document.querySelector("#analyzer-timestamp");
const analyzerSamples = document.querySelectorAll("[data-analyzer-keyword]");

const usdFormatter = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const compactFormatter = new Intl.NumberFormat("zh-CN", {
  notation: "compact",
  maximumFractionDigits: 1,
});

let currentAnalyzerRequest = null;

const EXAMPLE_KEYWORD = "portable power station";
const EXAMPLE_DATA = {
  keyword: EXAMPLE_KEYWORD,
  summary: {
    total: 5,
    price: { min: 149.5, max: 219, average: 181.5, count: 5 },
    averageRating: 4.48,
    ratingCount: 5,
    reviewDistribution: { high: 2, medium: 2, low: 1, unknown: 0 },
  },
  products: [
    {
      position: 1,
      title: "示例 Listing A — 296Wh 便携式太阳能储能电源",
      price: "$179.99",
      priceValue: 179.99,
      rating: 4.6,
      reviews: 3200,
      link: null,
      thumbnail: null,
      asin: null,
      isSponsored: false,
    },
    {
      position: 2,
      title: "示例 Listing B — 带交流插座的 300W 便携式储能电源",
      price: "$159.00",
      priceValue: 159,
      rating: 4.4,
      reviews: 850,
      link: null,
      thumbnail: null,
      asin: null,
      isSponsored: false,
    },
    {
      position: 3,
      title: "示例 Listing C — 适合露营与家庭备电的紧凑型储能电源",
      price: "$199.99",
      priceValue: 199.99,
      rating: 4.7,
      reviews: 12000,
      link: null,
      thumbnail: null,
      asin: null,
      isSponsored: false,
    },
    {
      position: 4,
      title: "示例 Listing D — 288Wh 便携式太阳能发电站",
      price: "$149.50",
      priceValue: 149.5,
      rating: 4.2,
      reviews: 420,
      link: null,
      thumbnail: null,
      asin: null,
      isSponsored: false,
    },
    {
      position: 5,
      title: "示例 Listing E — 300W 备用电池储能电源",
      price: "$219.00",
      priceValue: 219,
      rating: 4.5,
      reviews: 60,
      link: null,
      thumbnail: null,
      asin: null,
      isSponsored: false,
    },
  ],
};

renderExampleResults();

analyzerProducts.addEventListener("click", (event) => {
  const button = event.target.closest(".scan-disclosure");
  if (!button) return;

  const panel = document.getElementById(button.getAttribute("aria-controls"));
  if (!panel) return;

  const shouldExpand = button.getAttribute("aria-expanded") !== "true";
  analyzerProducts.querySelectorAll(".scan-disclosure[aria-expanded='true']").forEach((openButton) => {
    if (openButton === button) return;
    openButton.setAttribute("aria-expanded", "false");
    openButton.innerHTML = '查看详情 <span aria-hidden="true">⌄</span>';
    const openPanel = document.getElementById(openButton.getAttribute("aria-controls"));
    if (openPanel) openPanel.hidden = true;
  });

  button.setAttribute("aria-expanded", String(shouldExpand));
  button.innerHTML = shouldExpand
    ? '收起详情 <span aria-hidden="true">⌃</span>'
    : '查看详情 <span aria-hidden="true">⌄</span>';
  panel.hidden = !shouldExpand;
});

analyzerSamples.forEach((button) => {
  button.addEventListener("click", () => {
    analyzerKeyword.value = button.dataset.analyzerKeyword || "";
    analyzerForm.requestSubmit();
  });
});

analyzerForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const keyword = analyzerKeyword.value.trim();
  if (!keyword) {
    showAnalyzerMessage("请先输入产品关键词。", "error");
    return;
  }

  if (currentAnalyzerRequest) currentAnalyzerRequest.abort();

  const controller = new AbortController();
  currentAnalyzerRequest = controller;

  setAnalyzerLoading(true);
  showAnalyzerMessage(`正在扫描亚马逊关键词「${keyword}」…`, "info");
  renderAnalyzerLoading();

  try {
    const response = await fetch("/api/amazon-search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ keyword }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || "亚马逊搜索失败。");
    }

    renderAnalyzerResults(payload);
    const shown = Array.isArray(payload.products) ? payload.products.length : 0;
    const total = payload.summary?.total ?? shown;
    showAnalyzerMessage(`找到 ${total} 个竞品，以下展示 ${shown} 个商品。`, "success");
    window.requestAnimationFrame(() => {
      analyzerResults.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  } catch (error) {
    if (error.name !== "AbortError") {
      const message = error instanceof Error ? error.message : "亚马逊搜索失败。";
      showAnalyzerMessage(message, "error");
      renderAnalyzerError(message);
    }
  } finally {
    if (currentAnalyzerRequest === controller) currentAnalyzerRequest = null;
    setAnalyzerLoading(false);
  }
});

function setAnalyzerLoading(isLoading) {
  analyzerSubmit.disabled = isLoading;
  analyzerSubmit.textContent = isLoading ? "分析中…" : "开始分析";
}

function showAnalyzerMessage(text, type) {
  analyzerMessage.hidden = false;
  analyzerMessage.className = `analyzer-message ${type}`;
  analyzerMessage.textContent = text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value) {
  return typeof value === "number" && Number.isFinite(value) ? usdFormatter.format(value) : "--";
}

function average(value, digits = 1) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "--";
}

function reviews(value) {
  return typeof value === "number" && Number.isFinite(value) ? compactFormatter.format(value) : "未知";
}

function shortText(value, length = 54) {
  const text = String(value || "").trim();
  return text.length > length ? `${text.slice(0, length - 1)}...` : text;
}

function renderExampleResults() {
  renderAnalyzerResults(EXAMPLE_DATA);
  analyzerResultCount.textContent = "「便携式储能电源」示例结果";
  analyzerResultCount.classList.add("example");
  analyzerTimestamp.textContent = "在上方搜索以获取实时数据";
}

function renderAnalyzerLoading() {
  analyzerResultCount.classList.remove("example");
  analyzerResultCount.textContent = "分析中…";
  analyzerTimestamp.textContent = "";
  analyzerSummary.innerHTML = Array.from({ length: 4 })
    .map(() => skeletonMetric())
    .join("");
  analyzerInsights.innerHTML = Array.from({ length: 3 })
    .map(() => skeletonInsight())
    .join("");
  analyzerProducts.innerHTML = Array.from({ length: 4 })
    .map(() => skeletonProduct())
    .join("");
}

function renderAnalyzerResults(payload) {
  const stats = payload.summary || {};
  const price = stats.price || {};
  const productList = Array.isArray(payload.products) ? payload.products : [];
  const distribution = stats.reviewDistribution || {
    high: 0,
    medium: 0,
    low: 0,
    unknown: 0,
  };
  const priceRange =
    typeof price.min === "number" && typeof price.max === "number"
      ? `${money(price.min)} - ${money(price.max)}`
      : "--";

  analyzerResultCount.textContent = `展示 ${productList.length} / ${stats.total ?? productList.length}`;
  analyzerTimestamp.textContent = payload.fetchedAt ? `更新于 ${formatTime(payload.fetchedAt)}` : "";

  analyzerSummary.innerHTML = `
    ${metricCard("竞品数量", stats.total ?? 0, "自然搜索结果数量", "blue")}
    ${metricCard("价格区间", priceRange, `平均 ${money(price.average)}，共 ${price.count ?? 0} 个有价格的商品`, "green")}
    ${metricCard("平均评分", average(stats.averageRating), `${stats.ratingCount ?? 0} 个商品包含评分数据`, "purple")}
    ${reviewDistributionCard(distribution)}
  `;

  renderAnalyzerInsights(payload, productList, distribution);

  if (!productList.length) {
    analyzerProducts.innerHTML = `
      <div class="scan-empty">
        <div>
          <strong>未找到竞品</strong>
          <span>SerpApi 没有返回该关键词的自然搜索结果。</span>
        </div>
      </div>
    `;
    return;
  }

  analyzerProducts.innerHTML = productList.map((product) => productRow(product, price.average)).join("");
}

function renderAnalyzerError(message) {
  analyzerResultCount.textContent = "请求失败";
  analyzerTimestamp.textContent = "";
  analyzerSummary.innerHTML = `
    ${metricCard("竞品数量", "--", "请求失败", "blue")}
    ${metricCard("价格区间", "--", "请求失败", "green")}
    ${metricCard("平均评分", "--", "请求失败", "purple")}
    ${reviewDistributionCard({ high: 0, medium: 0, low: 0, unknown: 0 })}
  `;
  analyzerInsights.innerHTML = `
    ${insightCard("请求状态", "暂无数据", message, "orange")}
  `;
  analyzerProducts.innerHTML = `
    <div class="scan-empty">
      <div>
        <strong>暂无商品可展示</strong>
        <span>${escapeHtml(message)}</span>
      </div>
    </div>
  `;
}

function renderAnalyzerInsights(payload, productList, distribution) {
  const stats = payload.summary || {};
  const price = stats.price || {};
  const total = Math.max(1, stats.total || productList.length || 0);
  const topReviewProduct = productList
    .filter((product) => typeof product.reviews === "number")
    .sort((a, b) => b.reviews - a.reviews)[0];
  const highReviewCount = distribution.high || 0;
  const highReviewRatio = Math.round((highReviewCount / total) * 100);
  const entryMeta =
    typeof price.min === "number" && typeof price.average === "number" && price.average > 0
      ? `比均价低 ${average(((price.average - price.min) / price.average) * 100, 0)}%`
      : "需要更多价格样本";
  const reviewMeta = `${highReviewCount} 个商品的评论数超过 1000`;
  const topMeta = topReviewProduct ? shortText(topReviewProduct.title) : "暂无评论样本";

  analyzerInsights.innerHTML = `
    ${insightCard("切入价格", money(price.min), entryMeta, "green")}
    ${insightCard("评论门槛", `${highReviewRatio}% 高评论商品`, reviewMeta, "orange")}
    ${insightCard("评论数领先者", reviews(topReviewProduct?.reviews), topMeta, "blue")}
  `;
}

function metricCard(label, value, meta, tone) {
  return `
    <article class="scan-metric ${tone}">
      <strong>${escapeHtml(label)}</strong>
      <div class="scan-value">${escapeHtml(value)}</div>
      <p>${escapeHtml(meta)}</p>
    </article>
  `;
}

function insightCard(label, value, meta, tone) {
  return `
    <article class="scan-insight ${tone}">
      <strong>${escapeHtml(label)}</strong>
      <div class="scan-value">${escapeHtml(value)}</div>
      <p>${escapeHtml(meta)}</p>
    </article>
  `;
}

function reviewDistributionCard(distribution) {
  const total = Math.max(
    1,
    (distribution.high || 0) + (distribution.medium || 0) + (distribution.low || 0) + (distribution.unknown || 0),
  );
  return `
    <article class="scan-metric orange">
      <strong>评论量分布</strong>
      <div class="distribution">
        ${distributionRow("高：1000+", distribution.high || 0, total, "high")}
        ${distributionRow("中：100–999", distribution.medium || 0, total, "medium")}
        ${distributionRow("低：<100", distribution.low || 0, total, "low")}
      </div>
      <p>${distribution.unknown || 0} 个商品的评论数未知</p>
    </article>
  `;
}

function distributionRow(label, count, total, tone) {
  const percent = Math.round((count / total) * 100);
  return `
    <div class="distribution-row">
      <span>${escapeHtml(label)}</span>
      <div class="bar-track" aria-hidden="true"><span class="bar-fill ${tone}" style="width: ${percent}%"></span></div>
      <span>${count}</span>
    </div>
  `;
}

function productRow(product, averagePrice) {
  const priceBand = productPriceBand(product, averagePrice);
  const reviewBand = productReviewBand(product.reviews);
  const rating = typeof product.rating === "number" ? `${product.rating.toFixed(1)} / 5` : "未知";
  const panelId = `competitor-detail-${String(product.position ?? "item").replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const image = product.thumbnail
    ? `<img src="${escapeHtml(product.thumbnail)}" alt="" loading="lazy" />`
    : `<span aria-hidden="true">暂无图片</span>`;
  const asin = product.asin ? `<span>ASIN ${escapeHtml(product.asin)}</span>` : "";
  const link = product.link
    ? `<a class="scan-link" href="${escapeHtml(product.link)}" target="_blank" rel="noopener noreferrer">在亚马逊打开</a>`
    : "";

  return `
    <article class="scan-product">
      <div class="scan-product-summary">
        <div class="scan-rank">#${escapeHtml(product.position)}</div>
        <div class="scan-product-intro">
          <h4 class="scan-title">${escapeHtml(product.title)}</h4>
          <div class="scan-tags">
            <span class="${priceBand.tone}">${escapeHtml(priceBand.label)}</span>
            <span class="${reviewBand.tone}">${escapeHtml(reviewBand.label)}</span>
            ${asin}
          </div>
        </div>
        <div class="scan-quick-price"><span>价格</span><strong>${escapeHtml(product.price || "--")}</strong></div>
        <button class="scan-disclosure" type="button" aria-expanded="false" aria-controls="${panelId}">
          查看详情 <span aria-hidden="true">⌄</span>
        </button>
      </div>
      <div class="scan-product-panel" id="${panelId}" hidden>
        <div class="scan-image">${image}</div>
        <div class="scan-side">
        <div class="scan-product-metrics">
          <div class="scan-product-metric">
            <span>价格</span>
            <strong>${escapeHtml(product.price || "--")}</strong>
          </div>
          <div class="scan-product-metric">
            <span>评分</span>
            <strong>${escapeHtml(rating)}</strong>
            ${ratingMeter(product.rating)}
          </div>
          <div class="scan-product-metric">
            <span>评论数</span>
            <strong>${escapeHtml(reviews(product.reviews))}</strong>
          </div>
        </div>
        ${link}
      </div>
      </div>
    </article>
  `;
}

function productPriceBand(product, averagePrice) {
  if (typeof product.priceValue !== "number" || typeof averagePrice !== "number" || averagePrice <= 0) {
    return { label: "价格未知", tone: "" };
  }
  if (product.priceValue <= averagePrice * 0.85) return { label: "低价切入", tone: "green" };
  if (product.priceValue >= averagePrice * 1.15) return { label: "高价区间", tone: "orange" };
  return { label: "主流价格", tone: "blue" };
}

function productReviewBand(value) {
  if (typeof value !== "number") return { label: "评论未知", tone: "" };
  if (value >= 1000) return { label: "高评论量", tone: "orange" };
  if (value >= 100) return { label: "中等评论量", tone: "purple" };
  return { label: "低评论量", tone: "green" };
}

function ratingMeter(rating) {
  const percent = typeof rating === "number" ? Math.max(0, Math.min(100, (rating / 5) * 100)) : 0;
  return `<div class="rating-meter" aria-hidden="true"><span style="width: ${percent}%"></span></div>`;
}

function formatTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function skeletonMetric() {
  return `
    <article class="scan-metric">
      <div class="skeleton-block" style="width: 42%; min-height: 13px"></div>
      <div class="skeleton-block" style="width: 74%; min-height: 30px; margin-top: 14px"></div>
      <div class="skeleton-block" style="width: 60%; margin-top: 12px"></div>
    </article>
  `;
}

function skeletonInsight() {
  return `
    <article class="scan-insight">
      <div class="skeleton-block" style="width: 38%; min-height: 13px"></div>
      <div class="skeleton-block" style="width: 58%; min-height: 28px; margin-top: 14px"></div>
      <div class="skeleton-block" style="width: 82%; margin-top: 12px"></div>
    </article>
  `;
}

function skeletonProduct() {
  return `
    <article class="scan-skeleton">
      <div class="skeleton-block skeleton-image"></div>
      <div class="skeleton-stack">
        <div class="skeleton-block" style="width: 90%; min-height: 22px"></div>
        <div class="skeleton-block" style="width: 72%"></div>
        <div class="skeleton-block" style="width: 48%"></div>
      </div>
      <div class="skeleton-stack">
        <div class="skeleton-block"></div>
        <div class="skeleton-block"></div>
        <div class="skeleton-block"></div>
      </div>
    </article>
  `;
}
