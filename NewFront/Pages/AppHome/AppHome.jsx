import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconBrightnessDown,
  IconChartHistogram,
  IconChevronLeft,
  IconChevronRight,
  IconFileAnalytics,
  IconLogout,
  IconMessage,
  IconMoon,
  IconScale,
} from '@tabler/icons-react';
import FeedbackModal from './Components/FeedbackModal';
import RelativeValuationPortal from './Components/RelativeValuationPortal';
import LivingModelPortal from './Components/LivingModelPortal';
import FundamentalsPortal from './Components/FundamentalsPortal';
import { Logo } from '../../src/components/Logo';
import { Button } from '../../src/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '../../src/components/ui/tooltip';
import { cn } from '../../src/lib/utils';

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

// Thin shell — owns the header chrome (logo, feedback, logout, color scheme),
// the left rail (portal switcher), and renders the active portal in the main
// area. Each portal is self-contained over its own search state / data fetch.
const AppHome = () => {
  const navigate = useNavigate();
  const [activePortal, setActivePortal] = useState('fundamentals');
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [isLight, setIsLight] = useState(false);

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
            // title="Back to landing — your session stays signed in"
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

        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={() => setFeedbackOpen(true)} aria-label="Send feedback">
                <IconMessage size={18} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Send feedback</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={handleLogout} aria-label="Logout">
                <IconLogout size={18} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Logout</TooltipContent>
          </Tooltip>
        </div>
      </header>

      {/* ===================== Body ===================== */}
      <div className="flex flex-1 overflow-hidden">
        {!railCollapsed && (
          <nav className="flex w-[60px] shrink-0 flex-col items-center justify-between border-r border-border py-2">
            <div className="flex flex-col items-center gap-2">
              <RailButton
                active={activePortal === 'fundamentals'}
                onClick={() => setActivePortal('fundamentals')}
                label="Fundamentals — statements, ratios, DCF, diagram"
                icon={IconFileAnalytics}
              />
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

        {/* Keep all three portals mounted at once and toggle visibility.
            Unmounting on tab switch wipes each portal's useState (tickers,
            fetched data, slider positions). We CAN'T use `display:none`
            for inactive panels — Radix Slider measures its track via
            getBoundingClientRect at mount, which returns 0×0 inside a
            display:none parent. The slider would then map every pointer
            position to a degenerate value and drag would silently fail.
            Solution: stack all three absolutely, toggle visibility +
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
            <FundamentalsPortal />
          </div>
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
        </main>
      </div>
    </div>
  );
};

export default AppHome;
