// JS port of app/services/financial_ratios.py::present_values_fcf so the
// Living Model can value an FCF series client-side at slider speed.
//
// MUST STAY IN SYNC WITH THE BACKEND. If you change the discount math here,
// mirror the change in app/services/financial_ratios.py (and vice versa).

const epsilonNudge = (denom) => {
  if (Math.abs(denom) >= 1e-9) return denom;
  return denom >= 0 ? 1e-9 : -1e-9;
};

// fcfSeries: ordered array of forecast-year free cash flows (in dollars)
// wacc, terminalGrowth: decimals (0.10 = 10%)
// capStructure: { totalDebt, cash, sharesOutstanding }
//
// Returns the same shape the backend /dcf endpoint produces, with a trailing
// terminal-value row appended to the projected_fcf and present_values arrays
// (matches present_values_fcf's recent behavior).
export const runDcf = (fcfSeries, wacc, terminalGrowth, capStructure = {}) => {
  if (!Array.isArray(fcfSeries) || fcfSeries.length === 0) {
    return null;
  }

  const presentValues = [];
  const scheduleFcf = [];
  let totalPv = 0;
  fcfSeries.forEach((fcf, i) => {
    const periodIdx = i + 1;
    const discountFactor = Math.pow(1 + wacc, periodIdx);
    const pv = fcf / discountFactor;
    scheduleFcf.push(fcf);
    presentValues.push(pv);
    totalPv += pv;
  });

  // Gordon-growth terminal off the last forecast year FCF.
  const lastFcf = fcfSeries[fcfSeries.length - 1];
  const denom = epsilonNudge(wacc - terminalGrowth);
  const terminalValue = lastFcf * (1 + terminalGrowth) / denom;
  const terminalDiscountFactor = Math.pow(1 + wacc, fcfSeries.length);
  const terminalPv = terminalValue / terminalDiscountFactor;

  scheduleFcf.push(terminalValue);
  presentValues.push(terminalPv);
  totalPv += terminalPv;

  const totalDebt = capStructure.totalDebt ?? 0;
  const cash      = capStructure.cash ?? 0;
  const shares    = capStructure.sharesOutstanding ?? 0;

  const enterpriseValue = totalPv;
  const equityValue = enterpriseValue - totalDebt + cash;
  const perShareValue = shares > 0 ? equityValue / shares : 0;

  return {
    projectedFcf: scheduleFcf,
    presentValues,
    terminalValue,
    enterpriseValue,
    equityValue,
    perShareValue,
    isTerminalIndex: scheduleFcf.length - 1,
  };
};
