import { ActionIcon, AppShell, Box, Button, Drawer, Group, Paper, SegmentedControl, Select, SimpleGrid, Stack, Table, Tabs, TextInput, Title, Tooltip, Typography, UnstyledButton, useMantineColorScheme } from "@mantine/core";
import axios from "axios";
import globalConfig from '../../global/globalConfig.json'
import { useState } from "react";
import { filterUsGaap, organizeItemsBySections, TableDiff, usdFormatter } from "../../Helpers/TableHelpers";
import { IconBrightnessDown, IconBuildingBank, IconChevronLeft, IconChevronRight, IconLogout, IconMoon, IconSearch, IconSettings, IconX } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import FinancialComparisonTable from "./Components/RatioAnalysis";
import FinancialStatementViewer from "./Components/NewTrendTable";
import DCFAnalysis from "./Components/DCFAnalysis";
import Segments from "./Components/Segments";
import CommonSize from "./Components/CommonSize";
import KPIStrip from "./Components/KPIStrip";
import BankingSector from "./Components/BankingSector";
import { UnitsContext } from "../../Utilities/UnitsContext";
import { UNIT_OPTIONS } from "../../Utilities/formatters";


const AppHome = () => {

    const [ticker, setTicker] = useState('');
    const [tickers, setTickers] = useState([{ id: 1, ticker: '' }])
    const [reportType, setReportType] = useState('');
    const [year, setYear] = useState('');
    const [period, setPeriod] = useState(1);
    const [years, setYears] = useState([{ id: 1, year: '', quarter: '' }]);
    const [searchedYears, setSearchedYears] = useState([])

    // Compose the backend period string from a year entry. For 10-K we send
    // the bare year ("2024"); for 10-Q we send "Q<n> YYYY" so sec_service
    // can route it through the quarter-aware filing matcher.
    const formatPeriod = (entry) => {
        const y = (entry?.year || '').trim();
        if (!y) return '';
        if (reportType === '10-Q' && entry?.quarter) return `Q${entry.quarter} ${y}`;
        return y;
    };
    const [showRatioTable, setShowRatioTable] = useState(false);
    const navigate = useNavigate();


    // const [table, setTable] = useState({
    //     caption: ticker + ' ' + reportType + ' Report financials for the year ' + year,
    //     body: [],
    //     title: 'WEEEEE'
    // });

    //Refactor (single year vs multiple)
    //Extra years, maybe scroll if it's too many
    //Stripe page button
    //Make logout button work
    //Search for ratios API
    //Forgot other multi year statements
    //For ratios, analysis/use peer-group-analysis
    //   I had to comment a lot of the information out. It was barfing out about 20MB of data, enough to crash a device.

    const [incomeTable, setIncomeTable] = useState([]);
    const [balanceTable, setBalanceTable] = useState([]);
    const [cashflowTable, setcashFlowTable] = useState([]);

    const [fincomeTable, fsetIncomeTable] = useState([]);
    const [fbalanceTable, fsetBalanceTable] = useState([]);
    const [fcashflowTable, fsetcashFlowTable] = useState([]);
    const [ratioTable, setRatioTable] = useState({})
    const [activeTab, setActiveTab] = useState('Balance Sheet')

    const [simpleTickerData, setSimpleTickerData] = useState([])
    const [segmentsData, setSegmentsData] = useState(null);
    const [commonSizeData, setCommonSizeData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [units, setUnits] = useState('auto');
    const [activeView, setActiveView] = useState('equity');
    const [prefsOpen, setPrefsOpen] = useState(false);
    const [railCollapsed, setRailCollapsed] = useState(false);
    const STATEMENT_TABS = ['Balance Sheet', 'Income Statement', 'Cash Flow Statement'];

    const { colorScheme, setColorScheme, clearColorScheme } = useMantineColorScheme();

    const formatUSD = (amount) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    };


    // const handleSearchClick = () => {
    //     if(activeTab === 'Ratio Analysis'){
    //         getRatioAnalysis();
    //         return;
    //     }
    //     if (years.length > 1) {
    //         console.log('here')
    //         getMultiYearTicker();
    //     }
    //     else {
    //         getTickerInfo();
    //     }
    // }

    const validateInputs = () => {
        const tickerList = tickers.map((x) => x.ticker).filter(t => t.trim() !== '');
        const yearList = years.map(formatPeriod).filter(p => p !== '');
        if (tickerList.length === 0) { alert('Please enter at least one ticker'); return null; }
        if (yearList.length === 0) { alert('Please enter at least one year'); return null; }
        if (!reportType) { alert('Please select a report type'); return null; }
        return { tickerList, yearList };
    };

    const handleSearchClick = () => {
        const inputs = validateInputs();
        if (!inputs) return;

        setPrefsOpen(false);
        setActiveView('equity');
        setLoading(true);
        const calls = [getRatioAnalysis()];
        if (activeTab === 'Segments') calls.push(getSegments());
        else if (activeTab === 'Common Size') calls.push(getCommonSize());
        else if (STATEMENT_TABS.includes(activeTab)) calls.push(getSimpleTicker());
        // Ratio Analysis is already served by the primary call.

        Promise.allSettled(calls).finally(() => setLoading(false));
    }

    const getSegments = () => {
        const firstTicker = tickers[0]?.ticker?.trim();
        const yearList = years.map(formatPeriod).filter(p => p !== '');

        if (!firstTicker) {
            alert('Please enter a ticker');
            return;
        }
        if (yearList.length === 0) {
            alert('Please enter at least one year');
            return;
        }
        if (!reportType) {
            alert('Please select a report type');
            return;
        }

        return axios.post(globalConfig.appUrl + '/api/analysis/revenue-segments', {
            ticker: firstTicker,
            report_type: reportType,
            periods: yearList,
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + sessionStorage.getItem('token'),
            }
        }).then((response) => {
            setSegmentsData(response.data);
        }).catch((error) => {
            console.error('Error fetching segment analysis:', error);
            alert('Error: ' + (error.response?.data?.detail || error.message));
        });
    }

    const getCommonSize = () => {
        const tickerList = tickers.map((x) => x.ticker).filter(t => t.trim() !== '');
        const yearList = years.map(formatPeriod).filter(p => p !== '');

        if (tickerList.length === 0) {
            alert('Please enter at least one ticker');
            return;
        }
        if (yearList.length === 0) {
            alert('Please enter at least one year');
            return;
        }
        if (!reportType) {
            alert('Please select a report type');
            return;
        }

        return axios.post(globalConfig.appUrl + '/api/analysis/common-size', {
            tickers: tickerList,
            report_type: reportType,
            periods: yearList,
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + sessionStorage.getItem('token'),
            }
        }).then((response) => {
            setCommonSizeData(response.data);
        }).catch((error) => {
            console.error('Error fetching common size:', error);
            alert('Error: ' + (error.response?.data?.detail || error.message));
        });
    }

    const getRatioAnalysis = () => {
        // Validate inputs
        const tickerList = tickers.map((x) => x.ticker).filter(t => t.trim() !== '');
        const yearList = years.map(formatPeriod).filter(p => p !== '');
        
        if (tickerList.length === 0) {
            alert('Please enter at least one ticker');
            return;
        }
        if (yearList.length === 0) {
            alert('Please enter at least one year');
            return;
        }
        if (!reportType) {
            alert('Please select a report type');
            return;
        }

        console.log('Calling peer-group-analysis with:', { tickers: tickerList, report_type: reportType, periods: yearList });
        
        return axios.post(globalConfig.appUrl + '/api/analysis/peer-group-analysis', {
            tickers: tickerList,
            report_type: reportType,
            periods: yearList
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + sessionStorage.getItem('token')
            }
        }).then((response) => {
            console.log('Ratio analysis response:', response.data);
            setRatioTable(response.data);
            setShowRatioTable(true);
        }).catch((error) => {
            console.error('Error fetching ratio analysis:', error);
            alert('Error: ' + (error.response?.data?.detail || error.message));
        })
    }

    const getSimpleTicker = () => {
        let arrYear = years.map(formatPeriod).filter(p => p !== '');
        let arrTicker = tickers.map((x) => x.ticker)
        
         return axios.post(globalConfig.appUrl + '/api/analysis/test-this', {ticker: arrTicker, periods: arrYear, report_type: reportType}, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + sessionStorage.getItem('token')
            }
        }).then((x) => {
            setSimpleTickerData(x.data);
        })
    }

    const getTickerInfo = () => {
        axios.post(globalConfig.appUrl + '/api/companies/' + tickers[0].ticker + '/financials?report_type=' + reportType + '&period=' + encodeURIComponent(formatPeriod(years[0])), null, {
            headers: {
                'Content-Type': 'multipart/form-data',
                'Authorization': 'Bearer ' + sessionStorage.getItem('token')
            }
        }).then((x) => {

            const incomeStatementData = filterUsGaap(x.data.income_statement);
            const incomeSubsections = organizeItemsBySections(incomeStatementData, 'INCOME');
            const balanceSheetData = filterUsGaap(x.data.balance_sheet);
            const balanceSheetSubsections = organizeItemsBySections(balanceSheetData, 'BALANCE');
            const cashFlowData = filterUsGaap(x.data.cash_flow);
            const cashflowSubsections = organizeItemsBySections(cashFlowData, 'CASHFLOW');

            let balanceSheet = []
            balanceSheetSubsections.map((x) => {
                let body = [];

                x.items.map((y) => {
                    body.push([y[1].label, usdFormatter.format(y[1].value)])
                });

                balanceSheet.push({ title: x.title, body: body })

            });

            let incomeSheet = []
            incomeSubsections.map((x) => {
                let body = [];

                x.items.map((y) => {
                    body.push([y[1].label, usdFormatter.format(y[1].value)])
                });

                incomeSheet.push({ title: x.title, body: body })
            });

            let cashflowSheet = []
            cashflowSubsections.map((x) => {
                let body = [];

                x.items.map((y) => {
                    body.push([y[1].label, usdFormatter.format(y[1].value)])
                });

                cashflowSheet.push({ title: x.title, body: body });
            });

            setBalanceTable(balanceSheet);
            setIncomeTable(incomeSheet);
            setcashFlowTable(cashflowSheet);
        })

        if (years.length > 1) {
            getMultiYearTicker()
        }
        else {
            setPeriod(1);
        }


    }

    const getMultiYearTicker = () => {
        //Add a third year
        let arrYear = years.map(formatPeriod).filter(p => p !== '');
        axios.post(globalConfig.appUrl + '/api/analysis/trend-analysis', { periods: arrYear, report_type: reportType, ticker: tickers[0].ticker }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + sessionStorage.getItem('token')
            }
        }).then((x) => {
            let incomeSheet = [];
            let balanceSheet = [];
            let cashflowSheet = [];

            years.map((y) => {
                const periodKey = formatPeriod(y);
                if (!x.data.historical_data?.[periodKey]) return;
                let incomeStatementData = filterUsGaap(x.data.historical_data[periodKey].income_statement);
                let incomeStatementSections = organizeItemsBySections(incomeStatementData, 'INCOME');
                let balanceSheetData = filterUsGaap(x.data.historical_data[periodKey].balance_sheet);
                let balanceSheetSections = organizeItemsBySections(balanceSheetData, 'BALANCE');
                let cashflowData = filterUsGaap(x.data.historical_data[periodKey].cash_flow);
                let cashflowSections = organizeItemsBySections(cashflowData, 'CASHFLOW');

                incomeStatementSections.map((y) => {
                    let body = [];

                    let sheetIndex = incomeSheet.findIndex(x => x.title === y.title);

                    y.items.map((z) => {
                        let bodyIndex = incomeSheet[sheetIndex]?.body?.findIndex(b => b[0] === z[1].label);
                        if (bodyIndex > -1 && sheetIndex > -1) {
                            // This actually works.
                            incomeSheet[sheetIndex].body[bodyIndex].push(usdFormatter.format(z[1].value));
                        } else {
                            //
                            body.push([z[1].label, usdFormatter.format(z[1].value)]);
                        }
                    });

                    if (sheetIndex === -1) {
                        incomeSheet.push({ title: y.title, body: body });
                    } else if (body.length > 0) {
                        incomeSheet[sheetIndex].body.push(...body);
                    }
                });

                console.log(balanceSheetSections)
                balanceSheetSections.map((y, i) => {
                    let body = [];

                    let sheetIndex = balanceSheet.findIndex(x => x.title === y.title);

                    y.items.map((z) => {
                        let bodyIndex = balanceSheet[sheetIndex]?.body?.findIndex(b => b[0] === z[1].label);
                        if (bodyIndex > -1 && sheetIndex > -1) {
                            // This actually works.
                            balanceSheet[sheetIndex].body[bodyIndex].push(usdFormatter.format(z[1].value));
                        } else {
                            //
                            body.push([z[1].label, usdFormatter.format(z[1].value)]);
                        }
                    });

                    console.log(balanceSheet); // Move outside if you want post-loop view, or keep for debugging.
                    if (sheetIndex === -1) {
                        balanceSheet.push({ title: y.title, body: body });
                    } else if (body.length > 0) {
                        balanceSheet[sheetIndex].body.push(...body);
                    }
                });

                cashflowSections.map((y, i) => {
                    let body = [];

                    let sheetIndex = cashflowSheet.findIndex(x => x.title === y.title);

                    y.items.map((z) => {
                        let bodyIndex = cashflowSheet[sheetIndex]?.body?.findIndex(b => b[0] === z[1].label);
                        if (bodyIndex > -1 && sheetIndex > -1) {
                            // This actually works.
                            cashflowSheet[sheetIndex].body[bodyIndex].push(usdFormatter.format(z[1].value));
                        } else {
                            //
                            body.push([z[1].label, usdFormatter.format(z[1].value)]);
                        }
                    });

                    console.log(cashflowSheet); // Move outside if you want post-loop view, or keep for debugging.
                    if (sheetIndex === -1) {
                        cashflowSheet.push({ title: y.title, body: body });
                    } else if (body.length > 0) {
                        cashflowSheet[sheetIndex].body.push(...body);
                    }
                });

                // balanceTable.push({ year: y.year, balanceSheet });
                // incomeTable.push({ year: y.year, incomeSheet });
                // cashflowTable.push({ year: y.year, cashflowSheet });

            })

            setSearchedYears(arrYear)
            fsetBalanceTable(balanceSheet);
            fsetIncomeTable(incomeSheet);
            fsetcashFlowTable(cashflowSheet);
            setPeriod(2);
        })
    }

    const handleYearAdd = () => {
        setYears((prevData) => {
            let x = [...prevData];
            let keys = x.map(x => x.id);
            let newKey = Math.max(...keys) + 1;
            x.push({ id: newKey, year: '', quarter: '' });
            return x;
        })
    }

    const handleTickerAdd = () => {
        setTickers((prevData) => {
            let x = [...prevData];
            let keys = x.map(x => x.id);
            let newKey = Math.max(...keys) + 1;
            x.push({ id: newKey, ticker: '' });
            return x;
        })
    }

    const handleYearInput = (e, i, field = 'year') => {
        setYears((prevData) => {
            let temp = [...prevData];
            // Mantine Select fires `onChange(value)` while TextInput fires
            // `onChange(event)` — accept either.
            const value = e && typeof e === 'object' && 'target' in e ? e.target.value : e;
            temp[i] = { ...temp[i], [field]: value || '' };
            return temp;
        })
    }

    const handletickerInput = (e, i) => {
        setTickers((prevData) => {
            let temp = [...prevData];
            temp[i].ticker = e.target.value;
            return temp;
        })
    }

    const handleRemoveYear = (e) => {
        setYears(prevData => prevData.filter(x => x.id !== e))
    }

     const handleRemoveTicker = (e) => {
        setTickers(prevData => prevData.filter(x => x.id !== e))
    }

    const handleLogout = () => {
        navigate('/')
    }

    const railWidth = railCollapsed ? 0 : 60;

    return (<UnitsContext.Provider value={units}>
        <AppShell
            padding="md"
            header={{ height: 60 }}
            navbar={{
                width: railWidth,
                breakpoint: 'sm',
                collapsed: { desktop: railCollapsed, mobile: railCollapsed },
            }}
        >
            <AppShell.Header>
                <Box style={{ alignContent: 'center', height: '100%' }}>
                    <Group pr={10} pl={10} justify="space-between">
                        <Group gap="xs" align="center">
                            <Tooltip label={railCollapsed ? 'Show rail' : 'Hide rail'}>
                                <ActionIcon
                                    variant="subtle"
                                    onClick={() => setRailCollapsed((c) => !c)}
                                    aria-label="Toggle navigation rail"
                                >
                                    {railCollapsed ? <IconChevronRight size={18} /> : <IconChevronLeft size={18} />}
                                </ActionIcon>
                            </Tooltip>
                            <UnstyledButton onClick={() => navigate('/')} aria-label="Intrinsiq home">
                                <Group gap="xs" align="center">
                                    <IconSearch size={28} stroke={2.2} />
                                    <Title>
                                        Intrinsiq
                                    </Title>
                                </Group>
                            </UnstyledButton>
                        </Group>
                        <Tooltip label="Logout">
                            <Button variant="default">
                                <IconLogout
                                    onClick={handleLogout}
                                />
                            </Button>
                        </Tooltip>
                    </Group>
                </Box>
            </AppShell.Header>

            <AppShell.Navbar p={6}>
                <Stack justify="space-between" style={{ height: '100%' }} align="center">
                    <Stack gap="xs" align="center">
                        <Tooltip label="Preferences" position="right" withArrow>
                            <ActionIcon
                                size="xl"
                                variant={prefsOpen ? 'filled' : 'subtle'}
                                onClick={() => setPrefsOpen((o) => !o)}
                                aria-label="Preferences"
                            >
                                <IconSettings size={22} />
                            </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Banking Sector" position="right" withArrow>
                            <ActionIcon
                                size="xl"
                                variant={activeView === 'banking' ? 'filled' : 'subtle'}
                                onClick={() => setActiveView('banking')}
                                aria-label="Banking Sector"
                            >
                                <IconBuildingBank size={22} />
                            </ActionIcon>
                        </Tooltip>
                    </Stack>
                    <Tooltip label={colorScheme === 'dark' ? 'Light mode' : 'Dark mode'} position="right" withArrow>
                        <ActionIcon
                            size="xl"
                            variant="subtle"
                            onClick={() => setColorScheme(colorScheme === 'dark' ? 'light' : 'dark')}
                            aria-label="Toggle color scheme"
                        >
                            {colorScheme === 'dark' ? <IconBrightnessDown size={22} /> : <IconMoon size={22} />}
                        </ActionIcon>
                    </Tooltip>
                </Stack>
            </AppShell.Navbar>

            <Drawer
                opened={prefsOpen}
                onClose={() => setPrefsOpen(false)}
                position="left"
                size={320}
                title="Preferences"
                overlayProps={{ backgroundOpacity: 0.25, blur: 2 }}
                padding="md"
            >
                <Stack>
                    <Title order={4}>Search a Ticker</Title>

                    {/* Report type drives the period inputs below — annual
                        years for 10-K, quarter+year pairs for 10-Q. Sits at
                        the top so the user picks it before specifying any
                        periods. */}
                    <Stack gap={4}>
                        <Box style={{ fontSize: 11, fontWeight: 500, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            Report Type
                        </Box>
                        <SegmentedControl
                            fullWidth
                            value={reportType}
                            onChange={setReportType}
                            data={[
                                { label: '10-K (Annual)', value: '10-K' },
                                { label: '10-Q (Quarterly)', value: '10-Q' },
                            ]}
                        />
                    </Stack>

                    {tickers?.map((x, i) => (
                        <TextInput
                            placeholder={'Ticker ' + (i + 1)}
                            onChange={(e) => { handletickerInput(e, i) }}
                            maxLength={5}
                            key={x.id}
                            rightSection={i !== 0 ? <IconX onClick={() => { handleRemoveTicker(x.id) }} size={18} /> : null}
                        />
                    ))}
                    <Button onClick={handleTickerAdd}>Add Ticker</Button>

                    {years?.map((x, i) => (
                        reportType === '10-Q' ? (
                            <Group key={x.id} gap={6} wrap="nowrap" align="flex-end">
                                <Select
                                    placeholder="Quarter"
                                    value={x.quarter || null}
                                    onChange={(v) => handleYearInput(v, i, 'quarter')}
                                    data={[
                                        { value: '1', label: 'Q1' },
                                        { value: '2', label: 'Q2' },
                                        { value: '3', label: 'Q3' },
                                        { value: '4', label: 'Q4' },
                                    ]}
                                    style={{ flex: '0 0 90px' }}
                                />
                                <TextInput
                                    placeholder={'Year'}
                                    value={x.year || ''}
                                    onChange={(e) => handleYearInput(e, i)}
                                    maxLength={4}
                                    style={{ flex: 1 }}
                                    rightSection={i !== 0 ? <IconX onClick={() => handleRemoveYear(x.id)} size={18} /> : null}
                                />
                            </Group>
                        ) : (
                            <TextInput
                                key={x.id}
                                placeholder={'Year ' + (i + 1)}
                                value={x.year || ''}
                                onChange={(e) => handleYearInput(e, i)}
                                maxLength={4}
                                rightSection={i !== 0 ? <IconX onClick={() => handleRemoveYear(x.id)} size={18} /> : null}
                            />
                        )
                    ))}
                    <Button onClick={handleYearAdd}>
                        {reportType === '10-Q' ? 'Add Quarter' : 'Add Year'}
                    </Button>

                    <Button fullWidth onClick={handleSearchClick} loading={loading}>
                        Search
                    </Button>
                    <Stack gap={4} pt={4}>
                        <Box style={{ fontSize: 11, fontWeight: 500, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            Display Units
                        </Box>
                        <SegmentedControl
                            size="xs"
                            fullWidth
                            value={units}
                            onChange={setUnits}
                            data={UNIT_OPTIONS}
                        />
                    </Stack>
                </Stack>
            </Drawer>

            <AppShell.Main>
                {activeView === 'equity' ? (
                    <>
                        <KPIStrip
                            data={ratioTable}
                            loading={loading}
                            ticker={tickers[0]?.ticker}
                        />
                        <Tabs value={activeTab} onChange={setActiveTab}>
                            <Tabs.List>
                                <Tabs.Tab value="Balance Sheet">Balance Sheet</Tabs.Tab>
                                <Tabs.Tab value="Income Statement">Income Statement</Tabs.Tab>
                                <Tabs.Tab value="Cash Flow Statement">Cash Flow Statement</Tabs.Tab>
                                <Tabs.Tab value="Ratio Analysis">Ratio Analysis</Tabs.Tab>
                                <Tabs.Tab value="Segments">Segments</Tabs.Tab>
                                <Tabs.Tab value="Common Size">Common Size</Tabs.Tab>
                                <Tabs.Tab value="DCF">DCF</Tabs.Tab>
                            </Tabs.List>

                            <Tabs.Panel value="Balance Sheet">
                                <FinancialStatementViewer data={simpleTickerData} statementType="balance_sheet" />
                            </Tabs.Panel>
                            <Tabs.Panel value="Income Statement">
                                <FinancialStatementViewer data={simpleTickerData} statementType="income_statement" />
                            </Tabs.Panel>
                            <Tabs.Panel value="Cash Flow Statement">
                                <FinancialStatementViewer data={simpleTickerData} statementType="cash_flow" />
                            </Tabs.Panel>
                            <Tabs.Panel value="Ratio Analysis">
                                <FinancialComparisonTable
                                    data={showRatioTable ? ratioTable : null}
                                    selectedTickers={tickers.map((x) => x.ticker)}
                                    loading={loading}
                                />
                            </Tabs.Panel>
                            <Tabs.Panel value="Segments">
                                <Segments data={segmentsData} loading={loading} />
                            </Tabs.Panel>
                            <Tabs.Panel value="Common Size">
                                <CommonSize data={commonSizeData} loading={loading} />
                            </Tabs.Panel>
                            <Tabs.Panel value="DCF">
                                <DCFAnalysis
                                    ticker={tickers[0]?.ticker}
                                    reportType={reportType}
                                    period={years[0]?.year}
                                />
                            </Tabs.Panel>
                        </Tabs>
                    </>
                ) : (
                    <BankingSector />
                )}
            </AppShell.Main>
        </AppShell>
    </UnitsContext.Provider>)

    // return (<>
    //     <Group>
    //         <SideBar />
    //         <Box>
    //             Stuff
    //         </Box>
    //     </Group>
    // </>)
}

export default AppHome;
