import { useState } from 'react';
import {
    IconCalendarStats,
    IconDeviceDesktopAnalytics,
    IconFingerprint,
    IconGauge,
    IconHome2,
    IconSettings,
    IconUser,
} from '@tabler/icons-react';
import { Button, Input, Select, Stack, TextInput, Title, Tooltip, UnstyledButton } from '@mantine/core';
import { MantineLogo } from '@mantinex/mantine-logo';
import classes from './SideBar.module.css';
import axios from 'axios';
import globalConfig from '../../../global/globalConfig.json'

const mainLinksMockdata = [
    { icon: IconHome2, label: 'Home' },
    { icon: IconGauge, label: 'Dashboard' },
    { icon: IconDeviceDesktopAnalytics, label: 'Analytics' },
    { icon: IconCalendarStats, label: 'Releases' },
    { icon: IconUser, label: 'Account' },
    { icon: IconFingerprint, label: 'Security' },
    { icon: IconSettings, label: 'Settings' },
];

const linksMockdata = [
    'Security',
    'Settings',
    'Dashboard',
    'Releases',
    'Account',
    'Orders',
    'Clients',
    'Databases',
    'Pull Requests',
    'Open Issues',
    'Wiki pages',
];

const SideBar = () => {
    const [active, setActive] = useState('Get a Report');
    const [activeLink, setActiveLink] = useState('Settings');

    const [searchTicker, setSearchTicker] = useState({
        ticker: '',
        report_type: '',
        period: ''
    })

    const generateReport = () => {
        axios.post(globalConfig.appUrl + '/api/analysis/generate', searchTicker, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + sessionStorage.getItem('token')
            }
        }).then((x) => {
            console.log(x.data);
        })
    }



    const mainLinks = mainLinksMockdata.map((link) => (
        <Tooltip
            label={link.label}
            position="right"
            withArrow
            transitionProps={{ duration: 0 }}
            key={link.label}
        >
            <UnstyledButton
                onClick={() => setActive(link.label)}
                className={classes.mainLink}
                data-active={link.label === active || undefined}
            >
                <link.icon size={22} stroke={1.5} />
            </UnstyledButton>
        </Tooltip>
    ));

    const links = linksMockdata.map((link) => (
        <a
            className={classes.link}
            data-active={activeLink === link || undefined}
            href="#"
            onClick={(event) => {
                event.preventDefault();
                setActiveLink(link);
            }}
            key={link}
        >
            {link}
        </a>
    ));

    return (
        <nav className={classes.navbar}>
            <div className={classes.wrapper}>
                <div className={classes.main}>
                    <Title order={4} className={classes.title}>
                        {active}
                    </Title>
                    <Stack pl={'3%'} pr={'3%'}>
                        <TextInput
                            placeholder='Ticker'
                        />
                        <TextInput
                            placeholder='Start Date'
                        />
                        <TextInput
                            placeholder='End Date'
                        />
                        <Select
                            placeholder='Report Type'
                            data={['10-k', '10-Q']}
                        />
                        <Button
                            fullWidth
                        >
                            Search
                        </Button>
                    </Stack>
                </div>
            </div>
        </nav>
    );
}

export default SideBar