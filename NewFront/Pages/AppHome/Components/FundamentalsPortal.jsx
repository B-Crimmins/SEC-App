import { useState, useEffect } from 'react';
import { IconDownload } from '@tabler/icons-react';
import axios from 'axios';
import globalConfig from '../../../global/globalConfig.json';
import FinancialComparisonTable from './RatioAnalysis';
import FinancialStatementViewer from './NewTrendTable';
import DCFAnalysis from './DCFAnalysis';
import Segments from './Segments';
import CommonSize from './CommonSize';
import LinkageDiagram from './LinkageDiagram';
import { UnitsContext } from '../../../Utilities/UnitsContext';
import { Button } from '../../../src/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../../src/components/ui/tabs';
import PortalSearchBar from '../../../src/components/PortalSearchBar';
import { downloadFundamentalsExcel } from '../../../src/lib/exportFundamentalsExcel';

const FREE_TABS = ['Balance Sheet', 'Income Statement', 'Cash Flow Statement', 'Ratio Analysis', 'Segments', 'Common Size'];
const PRO_TABS = ['DCF', 'Diagram'];
const STATEMENT_TABS = [...FREE_TABS, ...PRO_TABS];

// Authenticated app's main analysis surface. Owns its own search state +
// fetch queue so toggling to Living Model and back doesn't disturb the
// loaded ratios / statements / DCF.
const FundamentalsPortal = ({ isPro = false }) => {
  const [tickers, setTickers] = useState([]);
  const [reportType, setReportType] = useState('10-K');
  const [years, setYears] = useState([]); // flat array of period strings: ['2024'] or ['Q1 2024']
  const [units, setUnits] = useState('M');

  const [simpleTickerData, setSimpleTickerData] = useState([]);
  const [segmentsData, setSegmentsData] = useState(null);
  const [commonSizeData, setCommonSizeData] = useState(null);
  const [activeTab, setActiveTab] = useState('Balance Sheet');
  const [loading, setLoading] = useState(false);

  const visibleTabs = isPro ? STATEMENT_TABS : FREE_TABS;

  useEffect(() => {
    if (!isPro && PRO_TABS.includes(activeTab)) {
      setActiveTab('Balance Sheet');
    }
  }, [isPro, activeTab]);

  const authHeader = () => ({
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + sessionStorage.getItem('token'),
  });

  const validateInputs = (yearList = years) => {
    const tickerList = tickers.filter((t) => t && t.trim() !== '');
    if (tickerList.length === 0) { alert('Please enter at least one ticker'); return null; }
    if (yearList.length === 0) { alert('Please enter at least one year'); return null; }
    if (!reportType) { alert('Please select a report type'); return null; }
    return { tickerList, yearList };
  };

  const handleSearchClick = (yearList) => {
    const inputs = validateInputs(yearList);
    if (!inputs) return;
    setLoading(true);
    const calls = [
      getSimpleTicker(inputs),
      getSegments(inputs),
      getCommonSize(inputs),
    ];
    Promise.allSettled(calls).finally(() => setLoading(false));
  };

  const getSegments = ({ tickerList, yearList }) => {
    const calls = tickerList.map((ticker) =>
      axios
        .post(
          globalConfig.appUrl + '/api/analysis/revenue-segments',
          { ticker, report_type: reportType, periods: yearList },
          { headers: authHeader() }
        )
        .then((r) => ({ ticker, data: r.data }))
        .catch(() => ({ ticker, data: null }))
    );
    return Promise.allSettled(calls).then((results) => {
      const map = {};
      results.forEach((res) => {
        if (res.status === 'fulfilled' && res.value.data) {
          map[res.value.ticker] = res.value.data;
        }
      });
      setSegmentsData(map);
    });
  };

  const getCommonSize = ({ tickerList, yearList }) =>
    axios
      .post(
        globalConfig.appUrl + '/api/analysis/common-size',
        { tickers: tickerList, report_type: reportType, periods: yearList },
        { headers: authHeader() }
      )
      .then((r) => setCommonSizeData(r.data))
      .catch((e) => alert('Error: ' + (e.response?.data?.detail || e.message)));

  const getSimpleTicker = ({ tickerList, yearList }) =>
    axios
      .post(
        globalConfig.appUrl + '/api/analysis/test-this',
        { ticker: tickerList, periods: yearList, report_type: reportType },
        { headers: authHeader() }
      )
      .then((r) => setSimpleTickerData(r.data));

  const handleDownloadExcel = () => {
    downloadFundamentalsExcel({
      tickers: tickers.filter((t) => t?.trim()),
      reportType,
      simpleTickerData,
      segmentsData,
      commonSizeData,
    }).catch(() => {
      alert('Failed to generate Excel file.');
    });
  };

  return (
    <UnitsContext.Provider value={units}>
      <div className="flex flex-col h-full overflow-hidden">
        <PortalSearchBar
          title="Fundamentals"
          tickers={tickers} onTickersChange={setTickers}
          reportType={reportType} onReportTypeChange={setReportType}
          years={years} onYearsChange={setYears}
          units={units} onUnitsChange={setUnits}
          loading={loading}
          onSearch={handleSearchClick}
        />

        <div className="flex-1 overflow-auto p-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <TabsList className="h-auto flex-wrap justify-start">
                {visibleTabs.map((t) => (
                  <TabsTrigger key={t} value={t}>{t}</TabsTrigger>
                ))}
              </TabsList>
              <Button variant="outline" size="sm" onClick={handleDownloadExcel}>
                <IconDownload size={16} />
                Download Excel
              </Button>
            </div>

            <TabsContent value="Balance Sheet">
              <FinancialStatementViewer data={simpleTickerData} statementType="balance_sheet" />
            </TabsContent>
            <TabsContent value="Income Statement">
              <FinancialStatementViewer data={simpleTickerData} statementType="income_statement" />
            </TabsContent>
            <TabsContent value="Cash Flow Statement">
              <FinancialStatementViewer data={simpleTickerData} statementType="cash_flow" />
            </TabsContent>
            <TabsContent value="Ratio Analysis">
              <FinancialComparisonTable
                data={null}
                selectedTickers={tickers}
                loading={false}
              />
            </TabsContent>
            <TabsContent value="Segments">
              <Segments dataByTicker={segmentsData} tickers={tickers} loading={loading} />
            </TabsContent>
            <TabsContent value="Common Size">
              <CommonSize data={commonSizeData} loading={loading} />
            </TabsContent>
            {isPro && (
              <>
                <TabsContent value="DCF">
                  <DCFAnalysis
                    ticker={tickers[0]}
                    reportType={reportType}
                    period={years[0]?.replace(/^Q\d\s*/, '')} // strip quarter prefix for DCF
                  />
                </TabsContent>
                <TabsContent value="Diagram">
                  <LinkageDiagram data={simpleTickerData} ticker={tickers[0]} />
                </TabsContent>
              </>
            )}
          </Tabs>
        </div>
      </div>
    </UnitsContext.Provider>
  );
};

export default FundamentalsPortal;
