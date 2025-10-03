import { Badge, Button, Card, Container, Group, SimpleGrid, Stack, Text, Title } from "@mantine/core"
import { IconCookie, IconGauge, IconUser } from '@tabler/icons-react';
import classes from './StripePage.module.css'


const StripePage = () => {



    return (
        <>
            <Container size="lg" py="xl">
                <Title order={1} ta="center">
                    Choose Your Plan
                </Title>

                <Text ta="center" mt="md">
                    Get access to powerful financial analysis tools. Start free and upgrade when you need more features.
                </Text>

                <SimpleGrid cols={{ base: 1, md: 2 }} spacing={{ base: 10, sm: 'xl' }} mt={50}>
                    <Card withBorder h={700} shadow="md" radius="md" padding="xl">
                        <Text fz="h2" fw={500} mt="md">
                            Free
                        </Text>
                        <Text fz="h2" fw={500} className={classes.cardTitle} mt="md">
                            $ 0 / month
                        </Text>
                        <Text fz="h4" fw={500} mt="md">
                            Great for getting started with our financial data analisys
                        </Text>
                        <Text fz="h5" fw={500} mt="md">
                            Whats included:
                        </Text>
                        <Stack h={'100%'} gap="xs" justify="space-between">
                            <div>
                                <Stack gap="xs">
                                    <Text fz="sm" mt="sm">
                                        10 API calls per month
                                    </Text>
                                    <Text fz="sm">
                                        Basic financial data access
                                    </Text>
                                    <Text fz="sm">
                                        Standard CSV export
                                    </Text>
                                    <Text fz="sm">
                                        Company search functionality
                                    </Text>
                                    <Text fz="sm">
                                        Basic financial reports
                                    </Text>
                                </Stack>
                                <Text fz="h5" fw={500} mt="md">
                                    Limitations:
                                </Text>
                                <Stack gap="xs">
                                    <Text fz="sm" mt="sm">
                                        No AI-powered analysis
                                    </Text>
                                    <Text fz="sm">
                                        Limited data retention
                                    </Text>
                                    <Text fz="sm">
                                        Standard CSV export
                                    </Text>
                                    <Text fz="sm">
                                        Standard processing speed
                                    </Text>
                                    <Text fz="sm">
                                        No priority support
                                    </Text>
                                </Stack>
                            </div>
                            <Button variant="outline" fullWidth>Get started for free</Button>
                        </Stack>
                    </Card>
                    <div style={{ position: 'relative' }}>
                        <Badge
                            size="lg"
                            variant="filled"
                            color="blue"
                            style={{
                                position: 'absolute',
                                top: -10, // Adjust to control overlap (negative value pulls it up over the border)
                                left: '50%',
                                transform: 'translateX(-50%)',
                                zIndex: 1,
                            }}
                        >
                            Most Popular
                        </Badge>
                        <Card withBorder h={700} shadow="md" radius="md" padding="xl">
                            <Group>
                                <Text fz="h2" fw={500} mt="md">
                                    Pro Subscription
                                </Text>
                            </Group>
                            <Text fz="h2" fw={500} className={classes.cardTitle} mt="md">
                                $ 29 / month
                            </Text>
                            <Text fz="h4" fw={500} mt="md">
                                Advanced features and tools for professional analisys
                            </Text>
                            <Text fz="h5" fw={500} mt="md">
                                Whats included:
                            </Text>
                            <Stack h={'100%'} gap="xs" justify="space-between">
                                <div>
                                    <Stack gap="xs" >
                                        <Text fz="sm" mt="sm">
                                            1000 API calls per month
                                        </Text>
                                        <Text fz="sm">
                                            Advanced AI-powered analysis
                                        </Text>
                                        <Text fz="sm">
                                            Multi-period trend analysis
                                        </Text>
                                        <Text fz="sm">
                                            Priority processing
                                        </Text>
                                        <Text fz="sm">
                                            Extended data retention
                                        </Text>
                                        <Text fz="sm">
                                            Advanced CSV export
                                        </Text>
                                        <Text fz="sm">
                                            Peer group analysis
                                        </Text>
                                        <Text fz="sm">
                                            Priority customer support
                                        </Text>
                                    </Stack>
                                </div>
                                <Button variant="gradient" gradient={{ from: 'blue', to: 'cyan', deg: 90 }} fullWidth>Subscribe Now</Button>
                            </Stack>
                        </Card>
                    </div>

                </SimpleGrid>
            </Container>
        </>
    )
}

export default StripePage