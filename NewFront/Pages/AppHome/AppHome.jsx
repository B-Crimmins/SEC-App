import { AppShell, Box, Button, Group, Select, Stack, Table, TextInput, Title } from "@mantine/core";
import SideBar from "./Components/SideBar";
import axios from "axios";
import globalConfig from '../../global/globalConfig.json'
import { useState } from "react";

const AppHome = () => {

    const [ticker, setTicker] = useState('AAPL');
    const [reportType, setReportType] = useState('10-K');
    const [year, setYear] = useState('2023');

    const [table, setTable] = useState({
        caption: ticker + ' ' + reportType + ' Report financials for the year ' + year,
        head: ['File Type', 'Quarter', 'Amount', 'Period'],
        body: [],
    });


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

            setTable((prevData) => {
                //debugger;
                let newData = { ...prevData }
                newData.body = d;
                console.log(newData)
                return newData;
            })

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
                <Box p={'1%'}>
                    <Title>
                        SEC-APP
                    </Title>
                </Box>
            </AppShell.Header>

            <AppShell.Navbar>
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
                    <Select
                        placeholder='Report Type'
                        data={['10-K', '10-Q']}
                        onChange={(e) => { setReportType(e) }}
                    />
                    <Button
                        fullWidth
                        onClick={getTickerInfo}
                    >
                        Search
                    </Button>
                </Stack>
            </AppShell.Navbar>

            <AppShell.Main>
                <Table
                    highlightOnHover
                    data={table}
                />

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