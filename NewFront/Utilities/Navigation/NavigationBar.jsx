import {
  Box,
  Burger,
  Button,
  Drawer,
  Group,
  ScrollArea,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { Logo } from '../../src/components/Logo';
import { useDisclosure } from '@mantine/hooks';
import classes from './navigation.module.css';
import { useLocation, useNavigate } from 'react-router-dom';

const NavigationBar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpened, { toggle: toggleDrawer, close: closeDrawer }] = useDisclosure(false);

  // Hide the marketing chrome inside the authenticated app shell.
  if (location.pathname.startsWith('/AppHome')) return null;

  const goHome = () => navigate('/');
  const goLogin = () => {
    closeDrawer();
    navigate('/login');
  };

  return (
    <Box pb={70}>
      <header className={classes.header}>
        <Group justify="space-between" h="100%">
          <UnstyledButton onClick={goHome} aria-label="Intrinsiq home">
            <Group gap={8} align="center" wrap="nowrap">
              <Logo size={28} color="var(--mantine-color-intrinsiq-4)" />
              <Title
                order={3}
                c="var(--mantine-color-intrinsiq-4)"
                style={{ fontFamily: "'Outfit', system-ui, sans-serif", fontWeight: 700, letterSpacing: '-0.01em' }}
              >
                Intrinsiq
              </Title>
            </Group>
          </UnstyledButton>

          <Group visibleFrom="sm">
            <Button variant="subtle" color="gray" onClick={goLogin}>
              Log in
            </Button>
            <Button onClick={goLogin}>Sign up</Button>
          </Group>

          <Burger opened={drawerOpened} onClick={toggleDrawer} hiddenFrom="sm" />
        </Group>
      </header>

      <Drawer
        opened={drawerOpened}
        onClose={closeDrawer}
        size="200%"
        padding="md"
        title="Intrinsiq"
        hiddenFrom="sm"
        zIndex={1000000}
      >
        <ScrollArea h="calc(100vh - 80px)" mx="-md">
          <Group justify="center" grow pb="xl" px="md">
            <Button variant="default" onClick={goLogin}>Log in</Button>
            <Button onClick={goLogin}>Sign up</Button>
          </Group>
        </ScrollArea>
      </Drawer>
    </Box>
  );
};

export default NavigationBar;
