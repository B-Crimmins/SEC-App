import ExcelJS from 'exceljs';
import { readDcfResult } from './crossPortalStore';

const NO_DATA_MESSAGE = 'No data available.';

const NO_DATA_ROWS = [[NO_DATA_MESSAGE]];

const FMT = {
  CURRENCY: '$#,##0',
  CURRENCY_DECIMAL: '$#,##0.00',
  PERCENT_POINTS: '0.00"%"',
  PERCENT_RATIO: '0.00%',
  MULTIPLE: '0.00"x"',
  DECIMAL: '0.00',
  INTEGER: '#,##0',
};

const NEGATIVE_AMOUNT_FONT = { color: { argb: 'FFC00000' } };

const SEGMENT_BUCKETS = [
  { key: 'geography', title: 'Geographic Segments' },
  { key: 'product', title: 'Product Segments' },
  { key: 'business_segment', title: 'Business Segments' },
];

const RATIO_LABELS = {
  net_working_capital_ratio: 'Net Working Capital Ratio',
  current_ratio: 'Current Ratio',
  quick_ratio: 'Quick Ratio',
  cash_ratio: 'Cash Ratio',
  debt_to_equity: 'Debt to Equity',
  debt_to_total_capitalization: 'Debt to Total Capitalization',
  total_assets_to_equity: 'Total Assets / Equity',
  book_value: 'Book Value',
  tangible_book_value: 'Tangible Book Value',
  average_age_of_plant: 'Average Age of Plant',
  average_remaining_life_of_plant: 'Average Remaining Life of Plant',
  average_total_life_span_of_plant: 'Average Total Life Span of Plant',
  inventory_turnover: 'Inventory Turnover',
  receivables_turnover: 'Receivables Turnover',
  operating_cash_flow_to_net_income: 'Operating Cash Flow / Net Income',
  capex_to_depreciation: 'CapEx / Depreciation',
  free_cash_flow: 'Free Cash Flow',
  revenue: 'Revenue',
  gross_profit_margin: 'Gross Profit Margin',
  operating_margin: 'Operating Margin',
  net_margin: 'Net Margin',
  ebitda_margin: 'EBITDA Margin',
  sga_percent_of_revenue: 'SG&A as % of Revenue',
  effective_tax_rate: 'Effective Tax Rate',
  roa: 'Return on Assets',
  roe: 'Return on Equity',
  roic: 'Return on Invested Capital',
  interest_coverage: 'Interest Coverage',
  earnings_per_share: 'Earnings Per Share',
};

const RATIO_FORMAT = {
  net_working_capital_ratio: FMT.PERCENT_RATIO,
  current_ratio: FMT.PERCENT_RATIO,
  quick_ratio: FMT.PERCENT_RATIO,
  cash_ratio: FMT.PERCENT_RATIO,
  debt_to_equity: FMT.PERCENT_RATIO,
  debt_to_total_capitalization: FMT.PERCENT_RATIO,
  total_assets_to_equity: FMT.MULTIPLE,
  book_value: FMT.CURRENCY_DECIMAL,
  tangible_book_value: FMT.CURRENCY_DECIMAL,
  average_age_of_plant: FMT.DECIMAL,
  average_remaining_life_of_plant: FMT.DECIMAL,
  average_total_life_span_of_plant: FMT.DECIMAL,
  inventory_turnover: FMT.MULTIPLE,
  receivables_turnover: FMT.MULTIPLE,
  operating_cash_flow_to_net_income: FMT.MULTIPLE,
  capex_to_depreciation: FMT.MULTIPLE,
  free_cash_flow: FMT.CURRENCY,
  revenue: FMT.CURRENCY,
  gross_profit_margin: FMT.PERCENT_POINTS,
  operating_margin: FMT.PERCENT_POINTS,
  net_margin: FMT.PERCENT_POINTS,
  ebitda_margin: FMT.PERCENT_POINTS,
  sga_percent_of_revenue: FMT.PERCENT_POINTS,
  effective_tax_rate: FMT.PERCENT_POINTS,
  roa: FMT.PERCENT_POINTS,
  roe: FMT.PERCENT_POINTS,
  roic: FMT.PERCENT_POINTS,
  interest_coverage: FMT.MULTIPLE,
  earnings_per_share: FMT.CURRENCY_DECIMAL,
};

const RATIO_SECTIONS = [
  {
    title: 'Liquidity Ratios',
    groups: [['net_working_capital_ratio', 'current_ratio', 'quick_ratio', 'cash_ratio']],
  },
  {
    title: 'Capital Ratios',
    groups: [
      ['debt_to_equity', 'debt_to_total_capitalization', 'total_assets_to_equity'],
      ['book_value', 'tangible_book_value'],
      ['average_age_of_plant', 'average_remaining_life_of_plant', 'average_total_life_span_of_plant'],
    ],
  },
  { title: 'Operating Ratios', groups: [['inventory_turnover', 'receivables_turnover']] },
  {
    title: 'Quality of Earnings Analysis',
    groups: [['operating_cash_flow_to_net_income', 'capex_to_depreciation', 'free_cash_flow']],
  },
  {
    title: 'Margins and Profitability',
    groups: [
      ['revenue', 'gross_profit_margin', 'operating_margin', 'net_margin', 'ebitda_margin', 'sga_percent_of_revenue', 'effective_tax_rate'],
      ['roa', 'roe', 'roic', 'interest_coverage', 'earnings_per_share'],
    ],
  },
];

const COMMON_SIZE_ROWS = [
  'cost_of_goods_sold',
  'gross_margin',
  'sga',
  'research_and_development',
  'depreciation_amortization',
  'operating_expenses',
  'operating_margin',
  'pre_tax_margin',
  'effective_tax_rate',
  'net_margin',
  'ebit',
  'ebit_margin',
  'ebitda',
  'ebitda_margin',
  'adjusted_ebit',
];

const COMMON_SIZE_DOLLAR_KEYS = new Set(['ebit', 'ebitda', 'adjusted_ebit']);

const FRONTEND_TABS = [
  { sheetName: 'Balance Sheet', key: 'balance_sheet' },
  { sheetName: 'Income Statement', key: 'income_statement' },
  { sheetName: 'Cash Flow Statement', key: 'cash_flow' },
  { sheetName: 'Ratio Analysis', key: 'ratio_analysis' },
  { sheetName: 'Segments', key: 'segments' },
  { sheetName: 'Common Size', key: 'common_size' },
  { sheetName: 'DCF', key: 'dcf' },
  { sheetName: 'Diagram', key: 'diagram' },
];

const DCF_VALUE_FORMAT = {
  'Per Share Value': FMT.CURRENCY_DECIMAL,
  'Enterprise Value': FMT.CURRENCY,
  'Equity Value': FMT.CURRENCY,
  'Discount Rate': FMT.PERCENT_RATIO,
  'Interim Growth Rate': FMT.PERCENT_RATIO,
  'Terminal Growth Rate': FMT.PERCENT_RATIO,
  'Forecast Periods': FMT.INTEGER,
  'Stock Price': FMT.CURRENCY_DECIMAL,
};

const sanitizeSheetName = (name) =>
  name.slice(0, 31).replace(/[\\/*?:[\]]/g, ' ').trim() || 'Sheet';

const displayTextLength = (value, numFmt) => {
  if (value === null || value === undefined) return 0;

  if (typeof value === 'number' && numFmt) {
    if (numFmt.includes('$')) {
      const decimals = numFmt.includes('.00') ? 2 : 0;
      const formatted = Math.abs(value).toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
      return `$${formatted}`.length;
    }
    if (numFmt.includes('"%"')) {
      return `${Math.abs(value).toFixed(2)}%`.length;
    }
    if (numFmt.includes('%')) {
      return `${(Math.abs(value) * 100).toFixed(2)}%`.length;
    }
    if (numFmt.includes('"x"')) {
      return `${value.toFixed(2)}x`.length;
    }
    if (numFmt.includes('#,##0')) {
      return Math.abs(value).toLocaleString('en-US').length;
    }
    return value.toFixed(2).length;
  }

  if (typeof value === 'number') {
    return value.toLocaleString('en-US').length;
  }

  return String(value).length;
};

const autoFitColumns = (sheet, columnCount) => {
  const maxWidths = Array.from({ length: columnCount }, () => 0);

  sheet.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (colNumber > columnCount) return;
      const len = displayTextLength(cell.value, cell.numFmt);
      maxWidths[colNumber - 1] = Math.max(maxWidths[colNumber - 1], len);
    });
  });

  for (let c = 1; c <= columnCount; c += 1) {
    const contentLen = maxWidths[c - 1] || 8;
    const padding = 2;
    if (c === 1) {
      sheet.getColumn(c).width = Math.min(52, Math.max(16, contentLen + padding));
    } else {
      sheet.getColumn(c).width = Math.min(24, Math.max(12, contentLen + padding));
    }
  }
};

const createFormatGrid = (rows) => rows.map((row) => row.map(() => null));

const setRowNumericFormats = (formats, rowIndex, startCol, count, fmt) => {
  for (let c = startCol; c < startCol + count; c += 1) {
    formats[rowIndex][c] = fmt;
  }
};

const applyNumericCellStyle = (cell, value, numFmt) => {
  if (typeof value !== 'number' || !numFmt) return;
  cell.numFmt = numFmt;
  if (value < 0 && numFmt.includes('$')) {
    cell.font = NEGATIVE_AMOUNT_FONT;
  }
};

const buildSheetSpec = (rows) => ({
  rows,
  formats: createFormatGrid(rows),
});

const mergeSheetSpecs = (specs) => {
  const rows = [];
  const formats = [];
  specs.forEach((spec, index) => {
    if (!spec) return;
    if (index > 0 && rows.length > 0) {
      rows.push([], []);
      formats.push([], []);
    }
    rows.push(...spec.rows);
    formats.push(...spec.formats);
  });
  return rows.length ? { rows, formats } : null;
};

const appendSheet = (workbook, usedNames, sheetName, spec) => {
  let name = sanitizeSheetName(sheetName);
  let suffix = 2;
  while (usedNames.has(name)) {
    name = sanitizeSheetName(`${sheetName} ${suffix}`);
    suffix += 1;
  }
  usedNames.add(name);

  const sheet = workbook.addWorksheet(name);
  const { rows, formats } = spec;

  rows.forEach((row, rowIndex) => {
    const excelRow = sheet.addRow(row);
    row.forEach((value, colIndex) => {
      const cell = excelRow.getCell(colIndex + 1);
      const fmt = formats?.[rowIndex]?.[colIndex];
      applyNumericCellStyle(cell, value, fmt);
    });
  });

  const columnCount = rows.reduce((max, row) => Math.max(max, row?.length || 0), 0);
  if (columnCount > 0) {
    autoFitColumns(sheet, columnCount);
  }
};

const buildStatementCompanyBlock = (company, statementType, statementLabel) => {
  const statementData = company.statements?.[statementType];
  const years = company.years || [];
  if (!statementData || years.length === 0) return null;

  const categories = Object.keys(statementData);
  if (categories.length === 0) return null;

  const ticker = company.company?.ticker || company.company?.cik || 'Company';
  const spec = buildSheetSpec([
    [`${ticker} — ${company.company?.name || ''}`.trim()],
    [`CIK: ${company.company?.cik || ''}`],
    [statementLabel],
    ['Values as reported in SEC filing (USD; per-share items in dollars per share)'],
    [],
    ['Line Item', ...years],
  ]);

  categories.forEach((category) => {
    const items = statementData[category];
    if (!items?.length) return;
    spec.rows.push([category]);
    spec.formats.push(spec.rows[spec.rows.length - 1].map(() => null));

    items.forEach((item) => {
      const rowIndex = spec.rows.length;
      spec.rows.push([
        item.type,
        ...years.map((year) => item.values?.[year] ?? null),
      ]);
      spec.formats.push(spec.rows[rowIndex].map(() => null));
      const fmt = item.value_kind === 'per_share' ? FMT.CURRENCY_DECIMAL : FMT.CURRENCY;
      setRowNumericFormats(spec.formats, rowIndex, 1, years.length, fmt);
    });
  });

  return spec;
};

const buildStatementsTabSpec = (data, statementType, statementLabel) => {
  const companies = data?.companies || [];
  if (!companies.length) return null;
  return mergeSheetSpecs(
    companies.map((company) => buildStatementCompanyBlock(company, statementType, statementLabel))
  );
};

const buildSegmentBucketTable = (data, bucketKey) => {
  const periods = data?.periods || [];
  if (periods.length === 0) return null;

  const labelOrder = [];
  const seen = new Set();
  periods.forEach((period) => {
    const segmentRows = data.by_period?.[period]?.[bucketKey] || [];
    segmentRows.forEach((row) => {
      if (!seen.has(row.label)) {
        seen.add(row.label);
        labelOrder.push(row.label);
      }
    });
  });

  if (labelOrder.length === 0) return null;

  const latestPeriod = periods[periods.length - 1];
  const latestMap = new Map(
    (data.by_period?.[latestPeriod]?.[bucketKey] || []).map((r) => [r.label, r.value])
  );
  labelOrder.sort((a, b) => (latestMap.get(b) ?? 0) - (latestMap.get(a) ?? 0));

  return { periods, labelOrder };
};

const buildSegmentsTabSpec = (segmentsData) => {
  const entries = Object.values(segmentsData || {}).filter((d) => d?.by_period);
  if (!entries.length) return null;

  const spec = buildSheetSpec([]);
  let hasContent = false;

  entries.forEach((data) => {
    SEGMENT_BUCKETS.forEach(({ key, title }) => {
      const built = buildSegmentBucketTable(data, key);
      if (!built) return;

      if (hasContent) {
        spec.rows.push([]);
        spec.formats.push([]);
      }
      hasContent = true;

      spec.rows.push([`${data.ticker} — ${data.company_name || ''}`.trim(), title]);
      spec.formats.push(spec.rows[spec.rows.length - 1].map(() => null));

      const headerIndex = spec.rows.length;
      spec.rows.push(['Segment', ...built.periods]);
      spec.formats.push(spec.rows[headerIndex].map(() => null));

      built.labelOrder.forEach((label) => {
        const rowIndex = spec.rows.length;
        spec.rows.push([
          label,
          ...built.periods.map((period) => {
            const row = (data.by_period?.[period]?.[key] || []).find((r) => r.label === label);
            return row?.value ?? null;
          }),
        ]);
        spec.formats.push(spec.rows[rowIndex].map(() => null));
        setRowNumericFormats(spec.formats, rowIndex, 1, built.periods.length, FMT.CURRENCY);
      });

      const totalIndex = spec.rows.length;
      spec.rows.push([
        'Total Revenue',
        ...built.periods.map((period) => data.by_period?.[period]?.total ?? null),
      ]);
      spec.formats.push(spec.rows[totalIndex].map(() => null));
      setRowNumericFormats(spec.formats, totalIndex, 1, built.periods.length, FMT.CURRENCY);
    });
  });

  return hasContent ? spec : null;
};

const getRatioCompanies = (ratioTable, selectedTickers) => {
  const peerGroup = ratioTable?.calculated_ratios?.peer_group_ratios;
  if (!peerGroup) return [];

  const allCompanies = Object.entries(peerGroup).map(([ticker, info]) => ({
    ticker,
    name: info.company_name,
    periods: info.periods,
  }));

  if (!selectedTickers?.length) return allCompanies;
  return allCompanies.filter((company) => selectedTickers.includes(company.ticker));
};

const ratioCellValue = (entry, ratioKey) => {
  if (!entry) return null;
  if (entry.value === null || entry.value === undefined) {
    return entry.null_reason ? 'N/A' : null;
  }
  if (typeof entry.value === 'number') return entry.value;
  return entry.formatted || null;
};

const buildRatioAnalysisTabSpec = (ratioTable, selectedTickers) => {
  const companies = getRatioCompanies(ratioTable, selectedTickers);
  if (!companies.length) return null;

  const years = Object.keys(companies[0].periods || {}).sort((a, b) => b.localeCompare(a));
  if (!years.length) return null;

  const dataColCount = years.length * companies.length;
  const spec = buildSheetSpec([
    ['Ratio and Margin Analysis'],
    ['Values as reported / computed from SEC filings'],
    [],
    ['Metric', ...years.flatMap((year) => companies.map((company) => `${company.ticker} ${year}`))],
  ]);

  RATIO_SECTIONS.forEach((section) => {
    spec.rows.push([section.title]);
    spec.formats.push(spec.rows[spec.rows.length - 1].map(() => null));

    section.groups.forEach((group) => {
      group.forEach((ratioKey) => {
        const label = RATIO_LABELS[ratioKey] || ratioKey;
        const rowIndex = spec.rows.length;
        spec.rows.push([
          label,
          ...years.flatMap((year) =>
            companies.map((company) => {
              const entry = company.periods?.[year]?.ratios?.[ratioKey];
              return ratioCellValue(entry, ratioKey);
            })
          ),
        ]);
        spec.formats.push(spec.rows[rowIndex].map(() => null));
        const fmt = RATIO_FORMAT[ratioKey];
        if (fmt) {
          setRowNumericFormats(spec.formats, rowIndex, 1, dataColCount, fmt);
        }
      });
    });
  });

  return spec;
};

const buildCommonSizeTabSpec = (commonSizeData) => {
  const companies = commonSizeData?.companies || [];
  if (!companies.length) return null;

  const years = (commonSizeData.years?.length
    ? [...commonSizeData.years]
    : []
  ).sort((a, b) => b.localeCompare(a));
  if (!years.length) return null;

  const labelLookup = {};
  companies.forEach((company) => {
    years.forEach((year) => {
      const ratios = company.periods?.[year]?.ratios;
      if (!ratios) return;
      COMMON_SIZE_ROWS.forEach((key) => {
        if (!labelLookup[key] && ratios[key]?.label) {
          labelLookup[key] = ratios[key].label;
        }
      });
    });
  });

  const visibleRows = COMMON_SIZE_ROWS.filter((key) => labelLookup[key]);
  if (!visibleRows.length) return null;

  const dataColCount = years.length * companies.length;
  const spec = buildSheetSpec([
    ['Common Size Analysis'],
    ['Percentages and dollar amounts as computed from SEC filings'],
    [],
    ['Metric', ...years.flatMap((year) => companies.map((company) => `${company.ticker} ${year}`))],
  ]);

  visibleRows.forEach((rowKey) => {
    const rowIndex = spec.rows.length;
    spec.rows.push([
      labelLookup[rowKey] || rowKey,
      ...years.flatMap((year) =>
        companies.map((company) => {
          const row = company.periods?.[year]?.ratios?.[rowKey];
          if (!row || row.value === null || row.value === undefined) return null;
          return row.value;
        })
      ),
    ]);
    spec.formats.push(spec.rows[rowIndex].map(() => null));
    const fmt = COMMON_SIZE_DOLLAR_KEYS.has(rowKey) ? FMT.CURRENCY : FMT.PERCENT_POINTS;
    setRowNumericFormats(spec.formats, rowIndex, 1, dataColCount, fmt);
  });

  return spec;
};

const buildDcfTabSpec = (primaryTicker) => {
  const cached = primaryTicker ? readDcfResult(primaryTicker) : readDcfResult();
  if (!cached) return null;

  const metrics = [
    ['Per Share Value', cached.perShareValue ?? null],
    ['Enterprise Value', cached.enterpriseValue ?? null],
    ['Equity Value', cached.equityValue ?? null],
    ['Discount Rate', cached.discountRate ?? null],
    ['Interim Growth Rate', cached.interimGrowthRate ?? null],
    ['Terminal Growth Rate', cached.terminalGrowthRate ?? null],
    ['Forecast Periods', cached.forecastPeriods ?? null],
    ['Stock Price', cached.stockPrice ?? null],
  ];

  const hasValue = metrics.some(([, value]) => value !== null && value !== undefined);
  if (!hasValue) return null;

  const spec = buildSheetSpec([
    ['DCF Valuation'],
    [`Ticker: ${cached.ticker || primaryTicker || ''}`],
    [],
    ['Metric', 'Value'],
  ]);

  metrics.forEach(([label, value]) => {
    const rowIndex = spec.rows.length;
    spec.rows.push([label, value]);
    spec.formats.push(spec.rows[rowIndex].map(() => null));
    if (typeof value === 'number' && DCF_VALUE_FORMAT[label]) {
      spec.formats[rowIndex][1] = DCF_VALUE_FORMAT[label];
    }
  });

  return spec;
};

const triggerDownload = async (workbook, filename) => {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob(
    [buffer],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

/**
 * Download one workbook with one worksheet per Fundamentals portal tab.
 * Uses in-memory search results only — no additional API calls.
 */
export async function downloadFundamentalsExcel({
  tickers = [],
  reportType = '',
  simpleTickerData,
  ratioTable,
  segmentsData,
  commonSizeData,
}) {
  const workbook = new ExcelJS.Workbook();
  const usedNames = new Set();
  const primaryTicker = tickers.find((t) => t?.trim()) || '';

  FRONTEND_TABS.forEach(({ sheetName, key }) => {
    let spec = buildSheetSpec(NO_DATA_ROWS);

    if (key === 'balance_sheet') {
      spec = buildStatementsTabSpec(simpleTickerData, 'balance_sheet', 'Balance Sheet') || spec;
    } else if (key === 'income_statement') {
      spec = buildStatementsTabSpec(simpleTickerData, 'income_statement', 'Income Statement') || spec;
    } else if (key === 'cash_flow') {
      spec = buildStatementsTabSpec(simpleTickerData, 'cash_flow', 'Cash Flow Statement') || spec;
    } else if (key === 'ratio_analysis') {
      spec = buildRatioAnalysisTabSpec(ratioTable, tickers) || spec;
    } else if (key === 'segments') {
      spec = buildSegmentsTabSpec(segmentsData) || spec;
    } else if (key === 'common_size') {
      spec = buildCommonSizeTabSpec(commonSizeData) || spec;
    } else if (key === 'dcf') {
      spec = buildDcfTabSpec(primaryTicker) || spec;
    } else if (key === 'diagram') {
      spec = buildSheetSpec([
        [NO_DATA_MESSAGE, 'The linkage diagram is a visual view and is not exported as tabular data.'],
      ]);
    }

    appendSheet(workbook, usedNames, sheetName, spec);
  });

  const tickerSlug = tickers.filter((t) => t?.trim()).join('_') || 'fundamentals';
  const reportSlug = reportType ? `_${reportType.replace(/\s+/g, '')}` : '';
  await triggerDownload(workbook, `${tickerSlug}${reportSlug}_fundamentals.xlsx`);
  return true;
}
