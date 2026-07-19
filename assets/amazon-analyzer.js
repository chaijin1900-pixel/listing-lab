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

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const compactFormatter = new Intl.NumberFormat("en-US", {
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
      title: "Example Listing A — Portable Power Station 296Wh Solar Generator",
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
      title: "Example Listing B — 300W Portable Power Station with AC Outlet",
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
      title: "Example Listing C — Compact Power Station for Camping & Home Backup",
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
      title: "Example Listing D — Portable Solar Generator 288Wh",
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
      title: "Example Listing E — Backup Battery Power Station 300W",
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
    showAnalyzerMessage("Enter a product keyword first.", "error");
    return;
  }

  if (currentAnalyzerRequest) currentAnalyzerRequest.abort();

  const controller = new AbortController();
  currentAnalyzerRequest = controller;

  setAnalyzerLoading(true);
  showAnalyzerMessage(`Scanning Amazon for "${keyword}"...`, "info");
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
      throw new Error(payload.error || "Amazon search failed.");
    }

    renderAnalyzerResults(payload);
    const shown = Array.isArray(payload.products) ? payload.products.length : 0;
    const total = payload.summary?.total ?? shown;
    showAnalyzerMessage(`Found ${total} competitors. Showing ${shown} products below.`, "success");
    window.requestAnimationFrame(() => {
      analyzerResults.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  } catch (error) {
    if (error.name !== "AbortError") {
      const message = error instanceof Error ? error.message : "Amazon search failed.";
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
  analyzerSubmit.textContent = isLoading ? "Scanning" : "Analyze";
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
  return typeof value === "number" && Number.isFinite(value) ? compactFormatter.format(value) : "Unknown";
}

function shortText(value, length = 54) {
  const text = String(value || "").trim();
  return text.length > length ? `${text.slice(0, length - 1)}...` : text;
}

function renderExampleResults() {
  renderAnalyzerResults(EXAMPLE_DATA);
  analyzerResultCount.textContent = `Example results for "${EXAMPLE_KEYWORD}"`;
  analyzerResultCount.classList.add("example");
  analyzerTimestamp.textContent = "Run a search above for live data";
}

function renderAnalyzerLoading() {
  analyzerResultCount.classList.remove("example");
  analyzerResultCount.textContent = "Scanning";
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

  analyzerResultCount.textContent = `Showing ${productList.length} / ${stats.total ?? productList.length}`;
  analyzerTimestamp.textContent = payload.fetchedAt ? `Updated ${formatTime(payload.fetchedAt)}` : "";

  analyzerSummary.innerHTML = `
    ${metricCard("Competitors", stats.total ?? 0, "organic_results count", "blue")}
    ${metricCard("Price Range", priceRange, `Average ${money(price.average)} from ${price.count ?? 0} priced products`, "green")}
    ${metricCard("Avg. Rating", average(stats.averageRating), `${stats.ratingCount ?? 0} products include rating data`, "purple")}
    ${reviewDistributionCard(distribution)}
  `;

  renderAnalyzerInsights(payload, productList, distribution);

  if (!productList.length) {
    analyzerProducts.innerHTML = `
      <div class="scan-empty">
        <div>
          <strong>No competitors found</strong>
          <span>SerpApi did not return organic_results for this keyword.</span>
        </div>
      </div>
    `;
    return;
  }

  analyzerProducts.innerHTML = productList.map((product) => productRow(product, price.average)).join("");
}

function renderAnalyzerError(message) {
  analyzerResultCount.textContent = "Request failed";
  analyzerTimestamp.textContent = "";
  analyzerSummary.innerHTML = `
    ${metricCard("Competitors", "--", "request failed", "blue")}
    ${metricCard("Price Range", "--", "request failed", "green")}
    ${metricCard("Avg. Rating", "--", "request failed", "purple")}
    ${reviewDistributionCard({ high: 0, medium: 0, low: 0, unknown: 0 })}
  `;
  analyzerInsights.innerHTML = `
    ${insightCard("Request Status", "No data", message, "orange")}
  `;
  analyzerProducts.innerHTML = `
    <div class="scan-empty">
      <div>
        <strong>No products to show</strong>
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
      ? `${average(((price.average - price.min) / price.average) * 100, 0)}% below average`
      : "Need more price samples";
  const reviewMeta = `${highReviewCount} products have 1000+ reviews`;
  const topMeta = topReviewProduct ? shortText(topReviewProduct.title) : "No review sample";

  analyzerInsights.innerHTML = `
    ${insightCard("Entry Price", money(price.min), entryMeta, "green")}
    ${insightCard("Review Barrier", `${highReviewRatio}% high-review`, reviewMeta, "orange")}
    ${insightCard("Top Review Leader", reviews(topReviewProduct?.reviews), topMeta, "blue")}
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
      <strong>Review Distribution</strong>
      <div class="distribution">
        ${distributionRow("High 1000+", distribution.high || 0, total, "high")}
        ${distributionRow("Mid 100-999", distribution.medium || 0, total, "medium")}
        ${distributionRow("Low <100", distribution.low || 0, total, "low")}
      </div>
      <p>${distribution.unknown || 0} products with unknown reviews</p>
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
  const rating = typeof product.rating === "number" ? `${product.rating.toFixed(1)} / 5` : "Unknown";
  const image = product.thumbnail
    ? `<img src="${escapeHtml(product.thumbnail)}" alt="" loading="lazy" />`
    : `<span>#${escapeHtml(product.position)}</span>`;
  const asin = product.asin ? `<span>ASIN ${escapeHtml(product.asin)}</span>` : "";
  const link = product.link
    ? `<a class="scan-link" href="${escapeHtml(product.link)}" target="_blank" rel="noopener noreferrer">Open Amazon</a>`
    : "";

  return `
    <article class="scan-product">
      <div class="scan-rank">#${escapeHtml(product.position)}</div>
      <div class="scan-image">${image}</div>
      <div>
        <h4 class="scan-title">${escapeHtml(product.title)}</h4>
        <div class="scan-tags">
          <span class="${priceBand.tone}">${escapeHtml(priceBand.label)}</span>
          <span class="${reviewBand.tone}">${escapeHtml(reviewBand.label)}</span>
          ${asin}
        </div>
      </div>
      <div class="scan-side">
        <div class="scan-product-metrics">
          <div class="scan-product-metric">
            <span>Price</span>
            <strong>${escapeHtml(product.price || "--")}</strong>
          </div>
          <div class="scan-product-metric">
            <span>Rating</span>
            <strong>${escapeHtml(rating)}</strong>
            ${ratingMeter(product.rating)}
          </div>
          <div class="scan-product-metric">
            <span>Reviews</span>
            <strong>${escapeHtml(reviews(product.reviews))}</strong>
          </div>
        </div>
        ${link}
      </div>
    </article>
  `;
}

function productPriceBand(product, averagePrice) {
  if (typeof product.priceValue !== "number" || typeof averagePrice !== "number" || averagePrice <= 0) {
    return { label: "Price unknown", tone: "" };
  }
  if (product.priceValue <= averagePrice * 0.85) return { label: "Low entry", tone: "green" };
  if (product.priceValue >= averagePrice * 1.15) return { label: "Premium band", tone: "orange" };
  return { label: "Core price", tone: "blue" };
}

function productReviewBand(value) {
  if (typeof value !== "number") return { label: "Reviews unknown", tone: "" };
  if (value >= 1000) return { label: "High reviews", tone: "orange" };
  if (value >= 100) return { label: "Mid reviews", tone: "purple" };
  return { label: "Low reviews", tone: "green" };
}

function ratingMeter(rating) {
  const percent = typeof rating === "number" ? Math.max(0, Math.min(100, (rating / 5) * 100)) : 0;
  return `<div class="rating-meter" aria-hidden="true"><span style="width: ${percent}%"></span></div>`;
}

function formatTime(value) {
  return new Intl.DateTimeFormat("en-US", {
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
