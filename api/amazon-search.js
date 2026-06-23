const SERPAPI_ENDPOINT = "https://serpapi.com/search";

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(payload));
}

function sendError(response, statusCode, message, detail) {
  sendJson(response, statusCode, {
    error: message,
    ...(detail ? { detail } : {}),
  });
}

async function readJsonBody(request) {
  if (Buffer.isBuffer(request.body)) return JSON.parse(request.body.toString("utf8") || "{}");
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");

  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 8192) throw new Error("Request body is too large.");
  }

  return raw.trim() ? JSON.parse(raw) : {};
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const normalized = value.replace(/,/g, "").trim().toLowerCase();
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*([km])?/);
  if (!match) return null;

  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount)) return null;

  if (match[2] === "k") return Math.round(amount * 1000);
  if (match[2] === "m") return Math.round(amount * 1000000);
  return amount;
}

function parsePrice(product) {
  const directValue =
    product?.extracted_price ??
    product?.extracted_price_low ??
    product?.price?.extracted ??
    product?.price?.value;
  const directNumber = toNumber(directValue);
  if (directNumber !== null) return directNumber;

  const rawPrice =
    typeof product?.price === "string"
      ? product.price
      : product?.price?.raw || product?.price?.text || product?.price?.displayed;

  if (typeof rawPrice !== "string") return null;

  const priceMatch = rawPrice.replace(/,/g, "").match(/\$?\s*(\d+(?:\.\d+)?)/);
  if (!priceMatch) return null;

  const price = Number.parseFloat(priceMatch[1]);
  return Number.isFinite(price) ? price : null;
}

function parseRating(value) {
  const rating = toNumber(value);
  if (rating === null) return null;
  return rating >= 0 && rating <= 5 ? rating : null;
}

function parseReviews(product) {
  const raw =
    product?.reviews ??
    product?.reviews_count ??
    product?.review_count ??
    product?.ratings_total ??
    product?.rating_count;
  const reviews = toNumber(raw);
  return reviews === null ? null : Math.max(0, Math.round(reviews));
}

function formatPriceText(product, priceValue) {
  if (typeof product?.price === "string" && product.price.trim()) return product.price.trim();
  if (product?.price?.raw) return String(product.price.raw);
  if (product?.price?.text) return String(product.price.text);
  if (priceValue !== null) return `$${priceValue.toFixed(2)}`;
  return null;
}

function normalizeProduct(product, index) {
  const priceValue = parsePrice(product);
  const rating = parseRating(product?.rating);
  const reviews = parseReviews(product);

  return {
    position: Number.isFinite(product?.position) ? product.position : index + 1,
    title: typeof product?.title === "string" ? product.title : "Untitled Amazon product",
    price: formatPriceText(product, priceValue),
    priceValue,
    rating,
    reviews,
    link: typeof product?.link === "string" ? product.link : null,
    thumbnail: typeof product?.thumbnail === "string" ? product.thumbnail : null,
    asin: typeof product?.asin === "string" ? product.asin : null,
    isSponsored: Boolean(product?.sponsored),
  };
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildSummary(products) {
  const prices = products
    .map((product) => product.priceValue)
    .filter((price) => typeof price === "number" && Number.isFinite(price));
  const ratings = products
    .map((product) => product.rating)
    .filter((rating) => typeof rating === "number" && Number.isFinite(rating));
  const reviewDistribution = {
    high: 0,
    medium: 0,
    low: 0,
    unknown: 0,
  };

  for (const product of products) {
    if (typeof product.reviews !== "number") {
      reviewDistribution.unknown += 1;
    } else if (product.reviews >= 1000) {
      reviewDistribution.high += 1;
    } else if (product.reviews >= 100) {
      reviewDistribution.medium += 1;
    } else {
      reviewDistribution.low += 1;
    }
  }

  return {
    total: products.length,
    price: {
      min: prices.length ? Math.min(...prices) : null,
      max: prices.length ? Math.max(...prices) : null,
      average: average(prices),
      count: prices.length,
    },
    averageRating: average(ratings),
    ratingCount: ratings.length,
    reviewDistribution,
  };
}

async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("allow", "POST");
    return sendError(response, 405, "Only POST requests are supported.");
  }

  let body;
  try {
    body = await readJsonBody(request);
  } catch {
    return sendError(response, 400, "Invalid JSON request body.");
  }

  const keyword = typeof body.keyword === "string" ? body.keyword.trim() : "";
  if (!keyword) {
    return sendError(response, 400, "Enter a product keyword.");
  }

  const apiKey = process.env.SERPAPI_API_KEY || process.env.SERPAPI_KEY;
  if (!apiKey) {
    return sendError(response, 500, "Missing SERPAPI_API_KEY. Add it to your environment variables.");
  }

  const url = new URL(SERPAPI_ENDPOINT);
  url.searchParams.set("engine", "amazon");
  url.searchParams.set("k", keyword);
  url.searchParams.set("amazon_domain", "amazon.com");
  url.searchParams.set("api_key", apiKey);

  try {
    const serpResponse = await fetch(url);
    const payload = await serpResponse.json().catch(() => ({}));

    if (!serpResponse.ok || payload.error) {
      return sendError(
        response,
        serpResponse.status || 502,
        "SerpApi request failed.",
        payload.error || payload,
      );
    }

    const organicResults = Array.isArray(payload.organic_results) ? payload.organic_results : [];
    const products = organicResults.map(normalizeProduct);

    return sendJson(response, 200, {
      keyword,
      amazonDomain: "amazon.com",
      fetchedAt: new Date().toISOString(),
      summary: buildSummary(products),
      products: products.slice(0, 10),
    });
  } catch (error) {
    return sendError(
      response,
      502,
      "Unable to reach SerpApi right now.",
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}

module.exports = handler;
