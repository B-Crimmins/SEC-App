import { AppShell, Box, Button, Group, Paper, Select, SimpleGrid, Stack, Table, TextInput, Title, Tooltip, Typography, useMantineColorScheme } from "@mantine/core";
import SideBar from "./Components/SideBar";
import axios from "axios";
import globalConfig from '../../global/globalConfig.json'
import { useState } from "react";
import { filterUsGaap, organizeItemsBySections, TableDiff } from "../../Helpers/TableHelpers";
import { IconBrightnessDown, IconLogout, IconMoon } from "@tabler/icons-react";


const AppHome = () => {

    const [ticker, setTicker] = useState('AAPL');
    const [reportType, setReportType] = useState('10-K');
    const [year, setYear] = useState('2023');
    const [year2, setYear2] = useState('');
    const [period, setPeriod] = useState(1);

    const [table, setTable] = useState({
        caption: ticker + ' ' + reportType + ' Report financials for the year ' + year,
        body: [],
        title: 'WEEEEE'
    });

    const [incomeTable, setIncomeTable] = useState([]);
    const [balanceTable, setBalanceTable] = useState([]);
    const [cashflowTable, setcashFlowTable] = useState([]);

    const [incomeTable2, setIncomeTable2] = useState([]);
    const [balanceTable2, setBalanceTable2] = useState([]);
    const [cashflowTable2, setcashFlowTable2] = useState([]);

    const [fincomeTable, fsetIncomeTable] = useState([]);
    const [fbalanceTable, fsetBalanceTable] = useState([]);
    const [fcashflowTable, fsetcashFlowTable] = useState([]);

    const { colorScheme, setColorScheme, clearColorScheme } = useMantineColorScheme();

    const [testTable, setTestTable] = useState([]);


    // const tableData = {
    //     caption: ticker + ' ' + reportType + ' Report financials for the year ' + year,
    //     head: ['File Type', 'Quarter', 'Amount', 'Period'],
    //     body: [
    //         [6, 12.011, 'C', 'Carbon'],
    //         [7, 14.007, 'N', 'Nitrogen'],
    //         [39, 88.906, 'Y', 'Yttrium'],
    //         [56, 137.33, 'Ba', 'Barium'],
    //         [58, 140.12, 'Ce', 'Cerium'],
    //     ],
    // };

    const formatUSD = (amount) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    };

    const handleSearchClick = () => {
        if (Boolean(year2)) {
            console.log('here')
            getTickerInfo2();
        }
        else {
            getTickerInfo();
        }
    }

    const getTickerInfo = () => {
        axios.post(globalConfig.appUrl + '/api/companies/' + ticker + '/financials?report_type=' + reportType + '&period=' + year, null, {
            headers: {
                'Content-Type': 'multipart/form-data',
                'Authorization': 'Bearer ' + sessionStorage.getItem('token')
            }
        }).then((x) => {
            console.log(x.data.balance_sheet["us-gaap.CashAndCashEquivalentsAtCarryingValue"]);

            let a = x.data.balance_sheet["us-gaap.CashAndCashEquivalentsAtCarryingValue"];
            let b = x.data.balance_sheet["us-gaap.CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"];

            let d = [
                [a.label, a.fiscal_period, formatUSD(a.value), a.period],
                [b.label, b.fiscal_period, formatUSD(b.value), b.period]
            ]

            const incomeStatementData = filterUsGaap(x.data.income_statement);
            const incomeStatementSections = [
                { title: 'REVENUES', keywords: ['revenue', 'sales', 'income from contract', 'net sales'] },
                { title: 'COST OF REVENUE', keywords: ['cost of goods', 'cost of revenue', 'cost of sales', 'cost of services'] },
                { title: 'GROSS PROFIT', keywords: ['gross profit'] },
                { title: 'OPERATING EXPENSES', keywords: ['research and development', 'rd', 'research', 'selling and marketing', 'marketing', 'advertising', 'general and administrative', 'g&a', 'administrative', 'operating expenses', 'total operating expenses'] },
                { title: 'OPERATING INCOME', keywords: ['operating income', 'operating profit', 'ebit', 'earnings before interest and taxes', 'income from operations'] },
                { title: 'OTHER INCOME (EXPENSE)', keywords: ['interest income', 'interest revenue', 'interest expense', 'interest', 'other income', 'other expense', 'gain', 'loss', 'non-operating', 'nonoperating', 'non operating'] },
                { title: 'INCOME BEFORE TAXES', keywords: ['income before taxes', 'pretax income', 'income from continuing operations'] },
                { title: 'INCOME TAX EXPENSE', keywords: ['income tax', 'tax expense', 'taxes', 'provision for income taxes'] },
                { title: 'PER SHARE DATA', keywords: ['earnings per share', 'eps', 'basic eps', 'diluted eps'] },
                { title: 'SHARES OUTSTANDING', keywords: ['shares outstanding', 'weighted average shares', 'basic shares', 'diluted shares'] },
                { title: 'NET INCOME', keywords: ['net income', 'net earnings', 'net profit', 'net income loss'] }
            ];
            const incomeSubsections = organizeItemsBySections(incomeStatementData, incomeStatementSections);

            // Organize balance sheet data (matching export logic exactly)
            const balanceSheetData = filterUsGaap(x.data.balance_sheet);
            const balanceSheetSections = [
                { title: 'ASSETS', keywords: ['total assets'] },
                { title: 'CURRENT ASSETS', keywords: ['current assets', 'cash and cash equivalents', 'cash', 'short term investments', 'marketable securities', 'accounts receivable', 'receivables', 'inventory', 'prepaid expenses', 'prepaid', 'other current assets'] },
                { title: 'NON-CURRENT ASSETS', keywords: ['non current assets', 'property plant and equipment', 'ppe', 'fixed assets', 'accumulated depreciation', 'intangible assets', 'goodwill', 'other assets'] },
                { title: 'LIABILITIES', keywords: ['total liabilities'] },
                { title: 'CURRENT LIABILITIES', keywords: ['current liabilities', 'accounts payable', 'payables', 'accrued liabilities', 'accrued expenses', 'short term debt', 'current debt', 'other current liabilities'] },
                { title: 'NON-CURRENT LIABILITIES', keywords: ['non current liabilities', 'long term debt', 'long term borrowings', 'deferred tax liabilities', 'other liabilities'] },
                { title: 'SHAREHOLDERS\' EQUITY', keywords: ['total equity', 'stockholders equity', 'shareholders equity', 'common stock', 'capital stock', 'additional paid in capital', 'paid in capital', 'retained earnings', 'accumulated earnings', 'treasury stock', 'other equity', 'comprehensive income', 'accumulated other comprehensive income'] }
            ];
            const balanceSheetSubsections = organizeItemsBySections(balanceSheetData, balanceSheetSections);

            // Organize cash flow data (matching export logic exactly)
            const cashFlowData = filterUsGaap(x.data.cash_flow);
            const cashFlowSections = [
                { title: 'CASH AND CASH EQUIVALENTS', keywords: ['cash and cash equivalents', 'cash', 'cash equivalents'] },
                { title: 'OPERATING ACTIVITIES', keywords: ['net income', 'depreciation and amortization', 'depreciation', 'stock based compensation', 'deferred taxes', 'changes in working capital', 'accounts receivable', 'inventory', 'accounts payable', 'other operating activities', 'net cash from operating activities'] },
                { title: 'INVESTING ACTIVITIES', keywords: ['capital expenditures', 'capex', 'acquisitions', 'business acquisitions', 'investments', 'other investing activities', 'net cash from investing activities'] },
                { title: 'FINANCING ACTIVITIES', keywords: ['debt issuance', 'borrowings', 'debt repayment', 'stock issuance', 'common stock issued', 'stock repurchases', 'treasury stock', 'dividends paid', 'other financing activities', 'net cash from financing activities'] },
                { title: 'NET CHANGE IN CASH', keywords: ['net change in cash', 'cash at beginning of period', 'cash at end of period'] }
            ];
            const cashflowSubsections = organizeItemsBySections(cashFlowData, cashFlowSections);





            //Massage the data here. 
            //Pull the Title as a group. First Column is the label when you drill in, second column is the value. Disregard everything else.
            let usdFormatter = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
            });


            let balanceSheet = []
            balanceSheetSubsections.map((x) => {
                let body = [];

                x.items.map((y) => {


                    body.push([y[1].label, usdFormatter.format(y[1].value)])
                })

                console.log(x.title);
                console.log(body)

                balanceSheet.push({ title: x.title, body: body })

            });

            //debugger
            let incomeSheet = []
            incomeSubsections.map((x) => {
                let body = [];

                x.items.map((y) => {
                    body.push([y[1].label, usdFormatter.format(y[1].value)])
                })

                console.log(x.title);
                console.log(body)

                incomeSheet.push({ title: x.title, body: body })

            });

            let cashflowSheet = []
            cashflowSubsections.map((x) => {
                let body = [];

                x.items.map((y) => {
                    body.push([y[1].label, usdFormatter.format(y[1].value)])
                })

                console.log(x.title);
                console.log(body)

                cashflowSheet.push({ title: x.title, body: body })

            });

            setBalanceTable(balanceSheet);
            setIncomeTable(incomeSheet);
            setcashFlowTable(cashflowSheet);


            setTable((prevData) => {
                //debugger;
                let newData = { ...prevData }
                newData.body = d;
                return newData;
            })

        })

        if (Boolean(year2)) {
            getTickerInfo2()
        }
        else {
            setPeriod(1);
        }


    }

    const getTickerInfo2 = () => {

        axios.post(globalConfig.appUrl + '/api/analysis/trend-analysis', { periods: [year, year2], report_type: reportType, ticker: ticker }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + sessionStorage.getItem('token')
            }
        }).then((x) => {

            //Brute force. Abstract
            //----------------------------------------------------
            const incomeStatementSections = [
                { title: 'REVENUES', keywords: ['revenue', 'sales', 'income from contract', 'net sales'] },
                { title: 'COST OF REVENUE', keywords: ['cost of goods', 'cost of revenue', 'cost of sales', 'cost of services'] },
                { title: 'GROSS PROFIT', keywords: ['gross profit'] },
                { title: 'OPERATING EXPENSES', keywords: ['research and development', 'rd', 'research', 'selling and marketing', 'marketing', 'advertising', 'general and administrative', 'g&a', 'administrative', 'operating expenses', 'total operating expenses'] },
                { title: 'OPERATING INCOME', keywords: ['operating income', 'operating profit', 'ebit', 'earnings before interest and taxes', 'income from operations'] },
                { title: 'OTHER INCOME (EXPENSE)', keywords: ['interest income', 'interest revenue', 'interest expense', 'interest', 'other income', 'other expense', 'gain', 'loss', 'non-operating', 'nonoperating', 'non operating'] },
                { title: 'INCOME BEFORE TAXES', keywords: ['income before taxes', 'pretax income', 'income from continuing operations'] },
                { title: 'INCOME TAX EXPENSE', keywords: ['income tax', 'tax expense', 'taxes', 'provision for income taxes'] },
                { title: 'PER SHARE DATA', keywords: ['earnings per share', 'eps', 'basic eps', 'diluted eps'] },
                { title: 'SHARES OUTSTANDING', keywords: ['shares outstanding', 'weighted average shares', 'basic shares', 'diluted shares'] },
                { title: 'NET INCOME', keywords: ['net income', 'net earnings', 'net profit', 'net income loss'] }
            ];

            const incomeStatementData = filterUsGaap(x.data.historical_data[year].income_statement);
            const incomeStatementData2 = filterUsGaap(x.data.historical_data[year2].income_statement);
            const incomeSubsections1 = organizeItemsBySections(incomeStatementData, incomeStatementSections);
            const incomeSubsections2 = organizeItemsBySections(incomeStatementData2, incomeStatementSections);

            // Organize balance sheet data (matching export logic exactly)
            const balanceSheetSections = [
                { title: 'ASSETS', keywords: ['total assets'] },
                { title: 'CURRENT ASSETS', keywords: ['current assets', 'cash and cash equivalents', 'cash', 'short term investments', 'marketable securities', 'accounts receivable', 'receivables', 'inventory', 'prepaid expenses', 'prepaid', 'other current assets'] },
                { title: 'NON-CURRENT ASSETS', keywords: ['non current assets', 'property plant and equipment', 'ppe', 'fixed assets', 'accumulated depreciation', 'intangible assets', 'goodwill', 'other assets'] },
                { title: 'LIABILITIES', keywords: ['total liabilities'] },
                { title: 'CURRENT LIABILITIES', keywords: ['current liabilities', 'accounts payable', 'payables', 'accrued liabilities', 'accrued expenses', 'short term debt', 'current debt', 'other current liabilities'] },
                { title: 'NON-CURRENT LIABILITIES', keywords: ['non current liabilities', 'long term debt', 'long term borrowings', 'deferred tax liabilities', 'other liabilities'] },
                { title: 'SHAREHOLDERS\' EQUITY', keywords: ['total equity', 'stockholders equity', 'shareholders equity', 'common stock', 'capital stock', 'additional paid in capital', 'paid in capital', 'retained earnings', 'accumulated earnings', 'treasury stock', 'other equity', 'comprehensive income', 'accumulated other comprehensive income'] }
            ];

            const balanceSheetData = filterUsGaap(x.data.historical_data[year].balance_sheet);
            const balanceSheetData2 = filterUsGaap(x.data.historical_data[year2].balance_sheet);
            const balanceSheetSubsections1 = organizeItemsBySections(balanceSheetData, balanceSheetSections);
            const balanceSheetSubsections2 = organizeItemsBySections(balanceSheetData2, balanceSheetSections);

            // Organize cash flow data (matching export logic exactly)
            const cashFlowSections = [
                { title: 'CASH AND CASH EQUIVALENTS', keywords: ['cash and cash equivalents', 'cash', 'cash equivalents'] },
                { title: 'OPERATING ACTIVITIES', keywords: ['net income', 'depreciation and amortization', 'depreciation', 'stock based compensation', 'deferred taxes', 'changes in working capital', 'accounts receivable', 'inventory', 'accounts payable', 'other operating activities', 'net cash from operating activities'] },
                { title: 'INVESTING ACTIVITIES', keywords: ['capital expenditures', 'capex', 'acquisitions', 'business acquisitions', 'investments', 'other investing activities', 'net cash from investing activities'] },
                { title: 'FINANCING ACTIVITIES', keywords: ['debt issuance', 'borrowings', 'debt repayment', 'stock issuance', 'common stock issued', 'stock repurchases', 'treasury stock', 'dividends paid', 'other financing activities', 'net cash from financing activities'] },
                { title: 'NET CHANGE IN CASH', keywords: ['net change in cash', 'cash at beginning of period', 'cash at end of period'] }
            ];

            const cashFlowData = filterUsGaap(x.data.historical_data[year].cash_flow);
            const cashFlowData2 = filterUsGaap(x.data.historical_data[year2].cash_flow);
            const cashflowSubsections1 = organizeItemsBySections(cashFlowData, cashFlowSections);
            const cashflowSubsections2 = organizeItemsBySections(cashFlowData2, cashFlowSections);
            //----------------------------------------------------

            //Massage the data here. 
            //Pull the Title as a group. First Column is the label when you drill in, second column is the value. Disregard everything else.
            let usdFormatter = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
            });


            let balanceSheet1 = []
            balanceSheetSubsections1.map((x) => {
                let body = [];

                x.items.map((y) => {


                    body.push([y[1].label, usdFormatter.format(y[1].value)])
                })


                balanceSheet1.push({ title: x.title, body: body })

            });

            let balanceSheet2 = []
            balanceSheetSubsections2.map((x) => {
                let body = [];

                x.items.map((y) => {


                    body.push([y[1].label, usdFormatter.format(y[1].value)])
                })


                balanceSheet2.push({ title: x.title, body: body })

            });

            //debugger
            let incomeSheet1 = []
            incomeSubsections1.map((x) => {
                let body = [];

                x.items.map((y) => {
                    body.push([y[1].label, usdFormatter.format(y[1].value)])
                })


                incomeSheet1.push({ title: x.title, body: body })

            });

            let incomeSheet2 = []
            incomeSubsections1.map((x) => {
                let body = [];

                x.items.map((y) => {
                    body.push([y[1].label, usdFormatter.format(y[1].value)])
                })


                incomeSheet2.push({ title: x.title, body: body })

            });

            let cashflowSheet1 = []
            cashflowSubsections1.map((x) => {
                let body = [];

                x.items.map((y) => {
                    body.push([y[1].label, usdFormatter.format(y[1].value)])
                })


                cashflowSheet1.push({ title: x.title, body: body })

            });

            let cashflowSheet2 = []
            cashflowSubsections2.map((x) => {
                let body = [];

                x.items.map((y) => {
                    body.push([y[1].label, usdFormatter.format(y[1].value)])
                })


                cashflowSheet2.push({ title: x.title, body: body })

            });




            console.log(balanceSheet1);
            debugger;

            let fbalanceSheet = [];
            let fincomeSheet = [];
            let fcashflowSheet = [];

            for (let i = 0; i < balanceSheet1.length; i++) {
                var farray = TableDiff(balanceSheet1[i].body, balanceSheet2[i].body);

                fbalanceSheet.push({ title: balanceSheet1[i].title, body: farray });

            }

            for (let i = 0; i < incomeSheet1.length; i++) {
                var farray = TableDiff(incomeSheet1[i].body, incomeSheet2[i].body);

                fincomeSheet.push({ title: incomeSheet1[i].title, body: farray });

            }

            for (let i = 0; i < cashflowSheet1.length; i++) {
                var farray = TableDiff(cashflowSheet1[i].body, cashflowSheet2[i].body);

                fcashflowSheet.push({ title: cashflowSheet1[i].title, body: farray });

            }

            fsetBalanceTable(fbalanceSheet);
            fsetIncomeTable(fincomeSheet);
            fsetcashFlowTable(fcashflowSheet);
            setPeriod(2);
        })
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
                                <IconLogout />
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
                            <TextInput
                                placeholder='Ticker'
                                onChange={(e) => { setTicker(e.target.value) }}
                            />
                            <TextInput
                                placeholder='Year'
                                onChange={(e) => { setYear(e.target.value) }}
                            />
                            <TextInput
                                placeholder='Year2'
                                onChange={(e) => { setYear2(e.target.value) }}
                            />
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
                {period === 1 &&
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
                        {fbalanceTable?.map((x) => (
                            <>
                                <Paper mb={10} withBorder shadow="xs" p="xl">
                                    <Title order={4}>{x.title}</Title>
                                    <Table highlightOnHover>
                                        <Table.Thead>
                                            <Table.Tr>
                                                <Table.Th w={50}>Type</Table.Th>
                                                <Table.Th ta='right' w={20}>{year}</Table.Th>
                                                <Table.Th ta='right' w={20}>{year2}</Table.Th>
                                            </Table.Tr>
                                        </Table.Thead>
                                        <Table.Tbody>
                                            {x.body?.map((x) => (
                                                <>
                                                    <Table.Tr>
                                                        <Table.Td w={50}>{x.label}</Table.Td>
                                                        <Table.Td ta='right' w={20}>{x.year1 === null ? '-' : x.year1}</Table.Td>
                                                        <Table.Td ta='right' w={20}>{x.year2 === null ? '-' : x.year2}</Table.Td>
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
