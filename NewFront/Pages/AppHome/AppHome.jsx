import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconBrightnessDown,
  IconChartHistogram,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconFileAnalytics,
  IconLogout,
  IconMessage,
  IconMoon,
  IconScale,
  IconUser,
} from '@tabler/icons-react';
import axios from 'axios';
import FeedbackModal from './Components/FeedbackModal';
import RelativeValuationPortal from './Components/RelativeValuationPortal';
import LivingModelPortal from './Components/LivingModelPortal';
import FundamentalsPortal from './Components/FundamentalsPortal';
import { Logo } from '../../src/components/Logo';
import { Button } from '../../src/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../src/components/ui/dropdown-menu';
import { Tooltip, TooltipTrigger, TooltipContent } from '../../src/components/ui/tooltip';
import { cn } from '../../src/lib/utils';
import globalConfig from '../../global/globalConfig.json';
import { getIsPro, setSessionIsPro } from '../../Utilities/subscription';

const PRO_PORTALS = new Set(['relativeValuation', 'livingModel']);

const RailButton = ({ active, onClick, label, icon: Icon }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        onClick={onClick}
        aria-label={label}
        className={cn(
          'flex h-11 w-11 items-center justify-center rounded-md transition-colors',
          active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-card-hover hover:text-foreground'
        )}
      >
        <Icon size={22} />
      </button>
    </TooltipTrigger>
    <TooltipContent side="right">{label}</TooltipContent>
  </Tooltip>
);

// Thin shell — owns the header chrome (logo, account menu, color scheme),
// the left rail (portal switcher), and renders the active portal in the main
// area. Each portal is self-contained over its own search state / data fetch.
const AppHome = () => {
  const navigate = useNavigate();
  const [isPro, setIsPro] = useState(getIsPro);
  const [activePortal, setActivePortal] = useState('fundamentals');
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [isLight, setIsLight] = useState(false);

  // Refresh Pro entitlement from the subscriptions table via status API.
  useEffect(() => {
    const token = sessionStorage.getItem('token');
    if (!token) return;
    axios
      .get(`${globalConfig.appUrl}/api/subscriptions/status`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        const paid = res.data?.is_pro === true;
        setSessionIsPro(paid);
        setIsPro(paid);
      })
      .catch(() => {
        // Keep sessionStorage entitlement on transient failures.
      });
  }, []);

  useEffect(() => {
    if (!isPro && PRO_PORTALS.has(activePortal)) {
      setActivePortal('fundamentals');
    }
  }, [isPro, activePortal]);

  const toggleColorScheme = () => {
    setIsLight((v) => {
      const next = !v;
      const root = document.querySelector('#root > div') || document.documentElement;
      if (next) root.classList.remove('dark');
      else root.classList.add('dark');
      return next;
    });
  };

  const handleLogout = () => navigate('/');

  const fundamentalsLabel = isPro
    ? 'Fundamentals — statements, ratios, DCF, diagram'
    : 'Fundamentals — statements, ratios, segments';

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      {/* ===================== Header ===================== */}
      <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setRailCollapsed((c) => !c)}
                aria-label="Toggle navigation rail"
              >
                {railCollapsed ? <IconChevronRight size={18} /> : <IconChevronLeft size={18} />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{railCollapsed ? 'Show rail' : 'Hide rail'}</TooltipContent>
          </Tooltip>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
            aria-label="Go to landing page"
          >
            <Logo size={32} color="hsl(var(--accent))" />
            <span
              className="text-2xl font-bold tracking-tight text-accent"
              style={{ fontFamily: "'Outfit', system-ui, sans-serif", letterSpacing: '-0.01em' }}
            >
              Intrinsiq
            </span>
          </button>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 px-2.5" aria-label="Account menu">
              <IconUser size={18} />
              <IconChevronDown size={14} className="text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => navigate('/Account')}>
              <IconUser size={16} />
              My Account
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setFeedbackOpen(true)}>
              <IconMessage size={16} />
              Send feedback
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleLogout} className="focus:text-destructive">
              <IconLogout size={16} />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* ===================== Body ===================== */}
      <div className="flex flex-1 overflow-hidden">
        {!railCollapsed && (
          <nav className="flex w-[60px] shrink-0 flex-col items-center justify-between border-r border-border py-2">
            <div className="flex flex-col items-center gap-2">
              <RailButton
                active={activePortal === 'fundamentals'}
                onClick={() => setActivePortal('fundamentals')}
                label={fundamentalsLabel}
                icon={IconFileAnalytics}
              />
              {isPro && (
                <>
                  <RailButton
                    active={activePortal === 'relativeValuation'}
                    onClick={() => setActivePortal('relativeValuation')}
                    label="Relative Valuation — peer multiples, spread attribution, DCF reconciliation"
                    icon={IconScale}
                  />
                  <RailButton
                    active={activePortal === 'livingModel'}
                    onClick={() => setActivePortal('livingModel')}
                    label="Living Model — driver-based projection"
                    icon={IconChartHistogram}
                  />
                </>
              )}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleColorScheme}
                  aria-label="Toggle color scheme"
                  className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-card-hover hover:text-foreground"
                >
                  {isLight ? <IconMoon size={22} /> : <IconBrightnessDown size={22} />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{isLight ? 'Dark mode' : 'Light mode'}</TooltipContent>
            </Tooltip>
          </nav>
        )}

        <FeedbackModal opened={feedbackOpen} onClose={() => setFeedbackOpen(false)} />

        {/* Keep portals mounted when Pro and toggle visibility.
            Unmounting on tab switch wipes each portal's useState (tickers,
            fetched data, slider positions). We CAN'T use `display:none`
            for inactive panels — Radix Slider measures its track via
            getBoundingClientRect at mount, which returns 0×0 inside a
            display:none parent. The slider would then map every pointer
            position to a degenerate value and drag would silently fail.
            Solution: stack portals absolutely, toggle visibility +
            pointer-events. Layout still computes (sliders measure right),
            only the active one is visible and interactive. */}
        <main className="flex-1 overflow-hidden relative">
          <div
            className={`absolute inset-0 ${
              activePortal === 'fundamentals'
                ? 'visible'
                : 'invisible pointer-events-none'
            }`}
            aria-hidden={activePortal !== 'fundamentals'}
          >
            <FundamentalsPortal isPro={isPro} />
          </div>
          {isPro && (
            <>
              <div
                className={`absolute inset-0 ${
                  activePortal === 'relativeValuation'
                    ? 'visible'
                    : 'invisible pointer-events-none'
                }`}
                aria-hidden={activePortal !== 'relativeValuation'}
              >
                <RelativeValuationPortal />
              </div>
              <div
                className={`absolute inset-0 ${
                  activePortal === 'livingModel'
                    ? 'visible'
                    : 'invisible pointer-events-none'
                }`}
                aria-hidden={activePortal !== 'livingModel'}
              >
                <LivingModelPortal />
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default AppHome;
