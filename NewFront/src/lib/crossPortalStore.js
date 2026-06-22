// Cross-portal state sharing via sessionStorage.
//
// Fundamentals (DCFAnalysis) and Living Model are sibling portals;
// neither can read the other's React state. The new RelativeValuation
// portal needs both surfaces — DCF intrinsic per-share, and the user's
// tuned driver assumptions — so we shunt them through sessionStorage.
//
// Stored as { ticker: ..., updatedAt: ... } so RV can decide whether
// the cached payload still matches the ticker it's looking at.

const DCF_KEY      = 'iq:dcfResult:v1';
const DRIVERS_KEY  = 'iq:livingModelDrivers:v1';

const safeGet = (key) => {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const safeSet = (key, value) => {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // sessionStorage quota or disabled — fail silently. RV falls back to defaults.
  }
};

// ---------- DCF ----------
export const writeDcfResult = (ticker, payload) => {
  if (!ticker || !payload) return;
  safeSet(DCF_KEY, {
    ticker: String(ticker).toUpperCase(),
    updatedAt: Date.now(),
    perShareValue: payload.per_share_value ?? payload.perShareValue ?? null,
    enterpriseValue: payload.enterprise_value ?? payload.enterpriseValue ?? null,
    equityValue: payload.equity_value ?? payload.equityValue ?? null,
    discountRate: payload.discount_rate ?? payload.discountRate ?? null,
    interimGrowthRate: payload.interim_growth_rate ?? payload.interimGrowthRate ?? null,
    terminalGrowthRate: payload.terminal_growth_rate ?? payload.terminalGrowthRate ?? null,
    forecastPeriods: payload.forecast_periods ?? payload.forecastPeriods ?? null,
    stockPrice: payload.stock_price ?? payload.stockPrice ?? null,
  });
};

export const readDcfResult = (ticker) => {
  const cached = safeGet(DCF_KEY);
  if (!cached) return null;
  if (ticker && cached.ticker !== String(ticker).toUpperCase()) return null;
  return cached;
};

// ---------- Living Model drivers ----------
// Drivers object shape matches what extractDrivers() / projection.js use:
// { revenueGrowth, grossMargin, opexPct, dso, dio, dpo, capexPct, daPct,
//   taxRate, interestRate, dividendPayout, otherAssetsPct, otherLiabPct }
export const writeDrivers = (ticker, drivers) => {
  if (!ticker || !drivers) return;
  safeSet(DRIVERS_KEY, {
    ticker: String(ticker).toUpperCase(),
    updatedAt: Date.now(),
    drivers,
  });
};

export const readDrivers = (ticker) => {
  const cached = safeGet(DRIVERS_KEY);
  if (!cached) return null;
  if (ticker && cached.ticker !== String(ticker).toUpperCase()) return null;
  return cached;
};
