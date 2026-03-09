import { AppShell, Box, Button, Group, Paper, Select, SimpleGrid, Stack, Table, Tabs, TextInput, Title, Tooltip, Typography, useMantineColorScheme } from "@mantine/core";
import SideBar from "./Components/SideBar";
import axios from "axios";
import globalConfig from '../../global/globalConfig.json'
import { useState } from "react";
import { filterUsGaap, organizeItemsBySections, TableDiff, usdFormatter } from "../../Helpers/TableHelpers";
import { IconBrightnessDown, IconLogout, IconMoon, IconX } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import FinancialComparisonTable from "./Components/RatioAnalysis";
import FinancialStatementViewer from "./Components/NewTrendTable";


const AppHome = () => {

    const [ticker, setTicker] = useState('');
    const [tickers, setTickers] = useState([{ id: 1, ticker: '' }])
    const [reportType, setReportType] = useState('');
    const [year, setYear] = useState('');
    const [period, setPeriod] = useState(1);
    const [years, setYears] = useState([{ id: 1, year: '' }]);
    const [searchedYears, setSearchedYears] = useState([])
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
    const [activeTab, setActiveTab] = useState('Statements')

    const [simpleTickerData, setSimpleTickerData] = useState([])

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

    const handleSearchClick = () => {
        if(activeTab === 'Ratio Analysis'){
            getRatioAnalysis();
            return;
        }

        if(activeTab === 'Statements'){
            getSimpleTicker();
            return;
        }        
    }

    const getRatioAnalysis = () => {
        axios.post(globalConfig.appUrl + '/api/analysis/peer-group-analysis', { tickers: tickers.map((x) => x.ticker), report_type: reportType, periods: years.map((x) => x.year) }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + sessionStorage.getItem('token')
            }
        }).then((x) => {
            setRatioTable(x.data);
            setShowRatioTable(true);
        })
    }

    const getSimpleTicker = () => {
        let arrYear = years.map((x) => x.year);
        let arrTicker = tickers.map((x) => x.ticker)
        
         axios.post(globalConfig.appUrl + '/api/analysis/test-this', {ticker: arrTicker, periods: arrYear, report_type: reportType}, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + sessionStorage.getItem('token')
            }
        }).then((x) => {
            setSimpleTickerData(x.data);
        })
    }

    const getTickerInfo = () => {
        axios.post(globalConfig.appUrl + '/api/companies/' + tickers[0].ticker + '/financials?report_type=' + reportType + '&period=' + years[0].year, null, {
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
        let arrYear = years.map((x) => x.year);
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
                let incomeStatementData = filterUsGaap(x.data.historical_data[y.year].income_statement);
                let incomeStatementSections = organizeItemsBySections(incomeStatementData, 'INCOME');
                let balanceSheetData = filterUsGaap(x.data.historical_data[y.year].balance_sheet);
                let balanceSheetSections = organizeItemsBySections(balanceSheetData, 'BALANCE');
                let cashflowData = filterUsGaap(x.data.historical_data[y.year].cash_flow);
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
            x.push({ id: newKey, year: '' });
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

    const handleYearInput = (e, i) => {
        setYears((prevData) => {
            let temp = [...prevData];
            temp[i].year = e.target.value;
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

    return (<>
        <AppShell
            padding="md"
            header={{ height: 60 }}
            navbar={{
                width: 300,
                breakpoint: 'sm',

            }}
        >
            <AppShell.Header>
                <Box style={{ alignContent: 'center', height: '100%' }}>
                    <Group pr={10} pl={10} justify="space-between">
                        <Title>
                            SEC-APP
                        </Title>
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

            <AppShell.Navbar>
                <Stack justify="space-between" style={{ height: '100%' }}>
                    <div>
                        <Stack pt={'6%'} pl={'6%'} pr={'6%'}>
                            <Title order={3}>
                                Search a Ticker
                            </Title>
                            {tickers?.map((x, i) => (
                                <TextInput
                                    placeholder={'Ticker ' + (i + 1)}
                                    onChange={(e) => { handletickerInput(e, i) }}
                                    maxLength={5}
                                    key={x.id}
                                    rightSection={i !== 0 ? <IconX onClick={() => { handleRemoveTicker(x.id) }} size={18} /> : null}
                                />
                            ))}
                            {/* <TextInput
                                placeholder='Ticker'
                                onChange={(e) => { setTicker(e.target.value) }}
                            /> */}
                            <Button
                                onClick={handleTickerAdd}
                            >
                                Add Ticker
                            </Button>
                            {years?.map((x, i) => (
                                <TextInput
                                    placeholder={'Year ' + (i + 1)}
                                    onChange={(e) => { handleYearInput(e, i) }}
                                    maxLength={4}
                                    key={x.id}
                                    rightSection={i !== 0 ? <IconX onClick={() => { handleRemoveYear(x.id) }} size={18} /> : null}
                                />
                            ))}
                            <Button
                                onClick={handleYearAdd}
                            >
                                Add Year
                            </Button>
                            <Select
                                placeholder='Report Type'
                                data={['10-K', '10-Q']}
                                onChange={(e) => { setReportType(e) }}
                            />
                            <Button
                                fullWidth
                                onClick={handleSearchClick}
                            >
                                Search
                            </Button>
                        </Stack>
                    </div>
                    <Box p={10}>
                        <Button variant="default">
                            {colorScheme === 'dark' ?
                                <IconBrightnessDown
                                    onClick={() => { setColorScheme('light') }}
                                />
                                :
                                <IconMoon
                                    onClick={() => { setColorScheme('dark') }}
                                />
                            }

                        </Button>
                    </Box>
                </Stack>
            </AppShell.Navbar>


            <AppShell.Main>
                <Tabs value={activeTab} onChange={setActiveTab}>
                    <Tabs.List>
                        <Tabs.Tab value="Statements">
                            Statements
                        </Tabs.Tab>
                        <Tabs.Tab value="Ratio Analysis">
                            Ratio Analysis
                        </Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="Statements">
                            <FinancialStatementViewer
                             data={simpleTickerData}
                            />
















                        {/* {period === 1 &&
                            <>
                                <Title pb={10} order={2}>Balance Statement</Title>
                                {balanceTable?.map((x) => (
                                    <>
                                        <Paper mb={10} withBorder shadow="xs" p="xl">
                                            <Title order={4}>{x.title}</Title>
                                            <Table highlightOnHover>
                                                <Table.Thead>
                                                    <Table.Tr>
                                                        <Table.Th w={50}>Type</Table.Th>
                                                        <Table.Th ta='right' w={20}>Amount</Table.Th>
                                                    </Table.Tr>
                                                </Table.Thead>
                                                <Table.Tbody>
                                                    {x.body?.map((x) => (
                                                        <>
                                                            <Table.Tr>
                                                                <Table.Td w={50}>{x[0]}</Table.Td>
                                                                <Table.Td ta='right' w={20}>{x[1]}</Table.Td>
                                                            </Table.Tr>
                                                        </>
                                                    ))}
                                                </Table.Tbody>
                                            </Table>
                                        </Paper>
                                    </>
                                ))}
                                <Title pb={10} order={2}>Cash Flow</Title>
                                {cashflowTable?.map((x) => (
                                    <>
                                        <Paper mb={10} withBorder shadow="xs" p="xl">
                                            <Title order={4}>{x.title}</Title>
                                            <Table highlightOnHover>
                                                <Table.Thead>
                                                    <Table.Tr>
                                                        <Table.Th w={50}>Type</Table.Th>
                                                        <Table.Th ta='right' w={20}>Amount</Table.Th>
                                                    </Table.Tr>
                                                </Table.Thead>
                                                <Table.Tbody>
                                                    {x.body?.map((x) => (
                                                        <>
                                                            <Table.Tr>
                                                                <Table.Td w={50}>{x[0]}</Table.Td>
                                                                <Table.Td ta='right' w={20}>{x[1]}</Table.Td>
                                                            </Table.Tr>
                                                        </>
                                                    ))}
                                                </Table.Tbody>
                                            </Table>
                                        </Paper>
                                    </>
                                ))}
                                <Title pb={10} order={2}>Income Statement</Title>
                                {incomeTable?.map((x) => (
                                    <>
                                        <Paper mb={10} withBorder shadow="xs" p="xl">
                                            <Title order={4}>{x.title}</Title>
                                            <Table highlightOnHover>
                                                <Table.Thead>
                                                    <Table.Tr>
                                                        <Table.Th w={50}>Type</Table.Th>
                                                        <Table.Th ta='right' w={20}>Amount</Table.Th>
                                                    </Table.Tr>
                                                </Table.Thead>
                                                <Table.Tbody>
                                                    {x.body?.map((x) => (
                                                        <>
                                                            <Table.Tr>
                                                                <Table.Td w={50}>{x[0]}</Table.Td>
                                                                <Table.Td ta='right' w={20}>{x[1]}</Table.Td>
                                                            </Table.Tr>
                                                        </>
                                                    ))}
                                                </Table.Tbody>
                                            </Table>
                                        </Paper>
                                    </>
                                ))}
                            </>
                        }

                        {period === 2 &&
                            <>
                                <Title pb={10} order={2}>Balance Statement</Title>
                                {fbalanceTable?.map((item, index) => (
                                    <Paper key={index} mb={10} withBorder shadow="xs" p="xl">
                                        <Title order={4}>{item.title}</Title>
                                        <Table highlightOnHover tableLayout="fixed">
                                            <Table.Thead>
                                                <Table.Tr>
                                                    <Table.Th
                                                        style={{
                                                            width: '100px',
                                                            minWidth: '50px',
                                                            whiteSpace: 'normal',
                                                            wordBreak: 'break-word',
                                                        }}
                                                    >
                                                        Type
                                                    </Table.Th>
                                                    {searchedYears?.map((year) => (
                                                        <Table.Th
                                                            key={year}
                                                            ta="right"
                                                            style={{
                                                                width: '150px',
                                                                minWidth: '150px',
                                                            }}
                                                        >
                                                            {year}
                                                        </Table.Th>
                                                    ))}
                                                </Table.Tr>
                                            </Table.Thead>
                                            <Table.Tbody>
                                                {item.body?.map((row, rowIndex) => (
                                                    <Table.Tr key={rowIndex}>
                                                        {row.map((cell, colIndex) => (
                                                            <Table.Td
                                                                key={colIndex}
                                                                ta={colIndex === 0 ? 'left' : 'right'}
                                                                style={{
                                                                    ...(colIndex === 0 && {
                                                                        whiteSpace: 'normal',
                                                                        wordBreak: 'break-word',
                                                                    }),
                                                                }}
                                                            >
                                                                {cell}
                                                            </Table.Td>
                                                        ))}
                                                    </Table.Tr>
                                                ))}
                                            </Table.Tbody>
                                        </Table>
                                    </Paper>
                                ))}
                                <Title pb={10} order={2}>Cash Flow</Title>
                                {fcashflowTable?.map((item, index) => (
                                    <Paper key={index} mb={10} withBorder shadow="xs" p="xl">
                                        <Title order={4}>{item.title}</Title>
                                        <Table highlightOnHover tableLayout="fixed">
                                            <Table.Thead>
                                                <Table.Tr>
                                                    <Table.Th
                                                        style={{
                                                            width: '100px',
                                                            minWidth: '50px',
                                                            whiteSpace: 'normal',
                                                            wordBreak: 'break-word',
                                                        }}
                                                    >
                                                        Type
                                                    </Table.Th>
                                                    {searchedYears?.map((year) => (
                                                        <Table.Th
                                                            key={year}
                                                            ta="right"
                                                            style={{
                                                                width: '150px',
                                                                minWidth: '150px',
                                                            }}
                                                        >
                                                            {year}
                                                        </Table.Th>
                                                    ))}
                                                </Table.Tr>
                                            </Table.Thead>
                                            <Table.Tbody>
                                                {item.body?.map((row, rowIndex) => (
                                                    <Table.Tr key={rowIndex}>
                                                        {row.map((cell, colIndex) => (
                                                            <Table.Td
                                                                key={colIndex}
                                                                ta={colIndex === 0 ? 'left' : 'right'}
                                                                style={{
                                                                    ...(colIndex === 0 && {
                                                                        whiteSpace: 'normal',
                                                                        wordBreak: 'break-word',
                                                                    }),
                                                                }}
                                                            >
                                                                {cell}
                                                            </Table.Td>
                                                        ))}
                                                    </Table.Tr>
                                                ))}
                                            </Table.Tbody>
                                        </Table>
                                    </Paper>
                                ))}
                                <Title pb={10} order={2}>Income Statement</Title>
                                {fincomeTable?.map((item, index) => (
                                    <Paper key={index} mb={10} withBorder shadow="xs" p="xl">
                                        <Title order={4}>{item.title}</Title>
                                        <Table highlightOnHover tableLayout="fixed">
                                            <Table.Thead>
                                                <Table.Tr>
                                                    <Table.Th
                                                        style={{
                                                            width: '100px',
                                                            minWidth: '50px',
                                                            whiteSpace: 'normal',
                                                            wordBreak: 'break-word',
                                                        }}
                                                    >
                                                        Type
                                                    </Table.Th>
                                                    {searchedYears?.map((year) => (
                                                        <Table.Th
                                                            key={year}
                                                            ta="right"
                                                            style={{
                                                                width: '150px',
                                                                minWidth: '150px',
                                                            }}
                                                        >
                                                            {year}
                                                        </Table.Th>
                                                    ))}
                                                </Table.Tr>
                                            </Table.Thead>
                                            <Table.Tbody>
                                                {item.body?.map((row, rowIndex) => (
                                                    <Table.Tr key={rowIndex}>
                                                        {row.map((cell, colIndex) => (
                                                            <Table.Td
                                                                key={colIndex}
                                                                ta={colIndex === 0 ? 'left' : 'right'}
                                                                style={{
                                                                    ...(colIndex === 0 && {
                                                                        whiteSpace: 'normal',
                                                                        wordBreak: 'break-word',
                                                                    }),
                                                                }}
                                                            >
                                                                {cell}
                                                            </Table.Td>
                                                        ))}
                                                    </Table.Tr>
                                                ))}
                                            </Table.Tbody>
                                        </Table>
                                    </Paper>
                                ))}
                            </>
                        } */}
                    </Tabs.Panel>
                    <Tabs.Panel value="Ratio Analysis">
                        <>
                            {showRatioTable && <FinancialComparisonTable data={ratioTable} selectedTickers={tickers.map((x) => x.ticker)}/>}
                        </>
                    </Tabs.Panel>
                </Tabs>
            </AppShell.Main>
        </AppShell>
    </>)

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
