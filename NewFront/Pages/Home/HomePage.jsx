import { useNavigate } from 'react-router-dom';
import {
  IconArrowRight,
  IconBook,
  IconCalculator,
  IconGitMerge,
  IconInfoCircle,
  IconSparkles,
  IconTrendingUp,
} from '@tabler/icons-react';
import { Badge } from '../../src/components/ui/badge';
import { Button } from '../../src/components/ui/button';
import { Card } from '../../src/components/ui/card';
import { cn } from '../../src/lib/utils';

// ---------------------------------------------------------------------------
// Mock visuals — these render as static React but mimic the actual app
// surfaces (ratio table with explanatory tooltip, DCF + reverse-DCF side by
// side, three-statement linkage diagram). The point of the landing page is
// to show what the app is, not to tell.
// ---------------------------------------------------------------------------

const RatioMock = () => (
  <div className="relative rounded-lg border border-border bg-card overflow-hidden shadow-lg">
    <div className="px-3 py-2 border-b border-border flex items-center justify-between">
      <div className="text-[10px] font-bold uppercase tracking-widest text-accent">Ratio Analysis</div>
      <div className="text-xs text-muted-foreground">NVDA · FY24 → FY25</div>
    </div>
    <table className="w-full text-xs">
      <tbody>
        {[
          { label: 'Gross Profit Margin', a: '72.7%', b: '75.0%', delta: '+230 bps', up: true },
          { label: 'Operating Margin',    a: '54.1%', b: '62.4%', delta: '+830 bps', up: true, highlighted: true },
          { label: 'Net Margin',          a: '48.9%', b: '55.9%', delta: '+700 bps', up: true },
          { label: 'Return on Equity',    a: '91.5%', b: '119.2%', delta: '+27.7 pp', up: true },
          { label: 'Debt to Equity',      a: '52.0%', b: '51.0%', delta: '−1.0 pp', up: true },
          { label: 'Current Ratio',       a: '405%',  b: '423%',  delta: '+18.0 pp', up: true },
        ].map((row, i) => (
          <tr key={i} className={cn('border-b border-border/40 last:border-b-0', row.highlighted && 'bg-accent/8')}>
            <td className="px-3 py-2 font-medium">{row.label}</td>
            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{row.a}</td>
            <td className="px-3 py-2 text-right tabular-nums">{row.b}</td>
            <td className={cn('px-3 py-2 text-right tabular-nums text-xs', row.up ? 'text-gain' : 'text-loss')}>{row.delta}</td>
          </tr>
        ))}
      </tbody>
    </table>

    {/* Open tooltip overlay — pinned to operating margin row */}
    <div className="absolute right-3 top-[112px] w-[260px] rounded-md border border-border bg-popover/95 backdrop-blur-sm p-3 text-xs shadow-2xl">
      <div className="font-semibold text-foreground mb-1">Operating Margin</div>
      <div className="text-muted-foreground mb-2">
        <span className="font-medium text-foreground">Formula: </span>
        Operating Income ÷ Revenue
      </div>
      <div className="text-muted-foreground mb-2">
        How much of each revenue dollar survives after the cost of running the business.
      </div>
      <div className="h-px bg-border my-2" />
      <div className="text-foreground">
        <span className="font-medium">YoY: </span>
        <span className="text-gain font-semibold">+830 bps (+15.3%)</span>
      </div>
      <div className="text-muted-foreground mt-1">
        <span className="font-medium text-foreground">Primary driver: </span>
        revenue scaled faster than opex (+114% rev vs +47% opex)
      </div>
    </div>
  </div>
);

const DcfMock = () => (
  <div className="rounded-lg border border-border bg-card overflow-hidden shadow-lg">
    <div className="px-3 py-2 border-b border-border flex items-center gap-2">
      <IconCalculator size={14} className="text-accent" />
      <div className="text-[10px] font-bold uppercase tracking-widest text-accent">DCF · Reverse DCF</div>
    </div>

    <div className="grid grid-cols-2 divide-x divide-border">
      <div className="p-3 space-y-3">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Forward DCF — your assumptions</div>
        {[
          { label: 'WACC',            val: '9.4%',  pct: 0.32 },
          { label: 'Revenue growth',  val: '5.0%',  pct: 0.18 },
          { label: 'Terminal growth', val: '3.0%',  pct: 0.12 },
        ].map((row) => (
          <div key={row.label}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="tabular-nums font-medium">{row.val}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-accent/70" style={{ width: `${row.pct * 100}%` }} />
            </div>
          </div>
        ))}
        <div className="pt-2 mt-2 border-t border-border">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Per Share Value</div>
          <div className="text-xl font-bold tabular-nums">$143.33</div>
        </div>
      </div>

      <div className="p-3 space-y-3 bg-accent/[0.04]">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Reverse DCF — market-implied</div>
        {[
          { label: 'WACC',            val: '9.4%',  pct: 0.32 },
          { label: 'Revenue growth',  val: '14.5%', pct: 0.62, solved: true },
          { label: 'Terminal growth', val: '3.0%',  pct: 0.12 },
        ].map((row) => (
          <div key={row.label} className={cn(row.solved && '-mx-3 px-3 py-1 bg-accent/15 rounded')}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className={cn('text-muted-foreground', row.solved && 'text-foreground font-semibold')}>
                {row.label}
                {row.solved && (
                  <span className="ml-1.5 text-[8px] uppercase tracking-wider bg-accent text-accent-foreground px-1 rounded">solved</span>
                )}
              </span>
              <span className={cn('tabular-nums', row.solved ? 'text-accent font-bold' : 'font-medium')}>{row.val}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className={cn('h-full', row.solved ? 'bg-accent' : 'bg-accent/70')} style={{ width: `${row.pct * 100}%` }} />
            </div>
          </div>
        ))}
        <div className="pt-2 mt-2 border-t border-border">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Target Price</div>
          <div className="text-xl font-bold tabular-nums text-accent">$200.00</div>
        </div>
      </div>
    </div>
  </div>
);

const LinkageMock = () => (
  <div className="rounded-lg border border-border bg-card overflow-hidden shadow-lg">
    <div className="px-3 py-2 border-b border-border flex items-center gap-2">
      <IconGitMerge size={14} className="text-accent" />
      <div className="text-[10px] font-bold uppercase tracking-widest text-accent">Three-Statement Linkages</div>
    </div>
    <div className="p-4">
      <svg viewBox="0 0 380 240" className="w-full">
        {/* Three statement cards */}
        {[
          { x: 8,   y: 10, label: 'IS', items: ['Revenue', 'Operating Income', 'Net Income', 'D&A'] },
          { x: 140, y: 10, label: 'BS', items: ['Cash', 'Inventory', 'PP&E', 'LT Debt', 'Retained Earnings'] },
          { x: 272, y: 10, label: 'CF', items: ['Net Income', '+ D&A', 'Δ Inventory', 'CapEx', 'Δ Cash'] },
        ].map((node, i) => (
          <g key={i}>
            <rect
              x={node.x} y={node.y}
              width={100} height={node.items.length * 18 + 26}
              rx={6}
              fill="hsl(var(--card-hover) / 0.6)"
              stroke="hsl(var(--border))"
              strokeWidth="1"
            />
            <text x={node.x + 8} y={node.y + 14} fontSize="10" fontWeight="700" fill="hsl(var(--accent))" letterSpacing="1">
              {node.label}
            </text>
            {node.items.map((item, j) => (
              <text
                key={j}
                x={node.x + 8}
                y={node.y + 30 + j * 18}
                fontSize="9"
                fill="hsl(var(--foreground))"
              >
                {item}
              </text>
            ))}
          </g>
        ))}

        {/* Edges with labels */}
        {[
          { from: [108, 65],  to: [272, 144], color: 'hsl(var(--accent))', label: 'NI → Retained Earnings' },
          { from: [108, 65],  to: [272, 50],  color: 'hsl(var(--accent))', label: 'NI → Op CF start' },
          { from: [108, 83],  to: [272, 68],  color: 'hsl(var(--gain))',   label: 'D&A add-back' },
          { from: [240, 84],  to: [272, 86],  color: 'hsl(var(--gain))',   label: 'Δ Inventory' },
          { from: [240, 102], to: [272, 104], color: 'hsl(var(--loss))',   label: 'Δ PP&E → CapEx' },
        ].map((e, i) => {
          const midX = (e.from[0] + e.to[0]) / 2;
          const midY = (e.from[1] + e.to[1]) / 2;
          return (
            <g key={i}>
              <path
                d={`M ${e.from[0]} ${e.from[1]} C ${midX} ${e.from[1]}, ${midX} ${e.to[1]}, ${e.to[0]} ${e.to[1]}`}
                fill="none"
                stroke={e.color}
                strokeWidth="1.2"
                opacity="0.85"
              />
              <circle cx={e.to[0]} cy={e.to[1]} r="2" fill={e.color} />
            </g>
          );
        })}

        {/* Side legend */}
        <g transform="translate(8, 195)">
          <text fontSize="8" fontWeight="700" fill="hsl(var(--muted-foreground))" letterSpacing="0.5">LINKAGES (CLICK FOR ROLLFORWARD)</text>
          <g transform="translate(0, 12)">
            <line x1="0" y1="4" x2="14" y2="4" stroke="hsl(var(--accent))" strokeWidth="1.8" />
            <text x="18" y="7" fontSize="8" fill="hsl(var(--muted-foreground))">Income → equity / CF</text>
            <line x1="130" y1="4" x2="144" y2="4" stroke="hsl(var(--gain))" strokeWidth="1.8" />
            <text x="148" y="7" fontSize="8" fill="hsl(var(--muted-foreground))">Working capital ⇄ Op CF</text>
            <line x1="260" y1="4" x2="274" y2="4" stroke="hsl(var(--loss))" strokeWidth="1.8" />
            <text x="278" y="7" fontSize="8" fill="hsl(var(--muted-foreground))">Investing / financing</text>
          </g>
        </g>
      </svg>
    </div>
  </div>
);

// ---------------------------------------------------------------------------

const Hero = ({ onGetStarted }) => (
  <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-accent/5 via-background to-background">
    <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
      <div className="grid md:grid-cols-5 gap-10 items-center">
        <div className="md:col-span-3 space-y-6">
          <Badge variant="outline" className="px-3 py-1 border-accent/40 bg-accent/10 text-accent">
            <IconSparkles size={14} className="mr-1.5" /> Fundamentals from primary source
          </Badge>
          <h1 className="text-4xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
            Read a 10-K. Build the valuation.
            <span className="text-accent"> See where every number lives.</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl">
            Intrinsiq turns SEC filings into a working financial model — ratios with their formulas in plain view,
            DCF running alongside its reverse, and every line on the income statement traced to its home on the
            balance sheet and cash flow.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" onClick={onGetStarted}>
              Sign in to analyze any ticker <IconArrowRight size={16} />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground pt-1">
            Built for the analysis that happens before the spreadsheet — when you're still building intuition for
            what the numbers mean.
          </p>
        </div>

        {/* Hero side: the ratio mock as the visual hook */}
        <div className="md:col-span-2">
          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-tr from-accent/20 to-transparent blur-3xl opacity-50" />
            <div className="relative">
              <RatioMock />
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

const DemoGrid = () => (
  <section id="demo" className="mx-auto max-w-6xl px-6 py-20">
    <div className="space-y-2 mb-10 max-w-3xl">
      <Badge variant="success">Inside the app</Badge>
      <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">What you see when you load a ticker</h2>
      <p className="text-muted-foreground">
        Every screen is built to make the framework visible. You don't just see the ratio — you see what it means,
        how it changed, and what's driving the change.
      </p>
    </div>

    <div className="grid lg:grid-cols-2 gap-6">
      {/* Wide row 1 — ratio explainer */}
      <Card className="p-5 lg:col-span-2 grid md:grid-cols-2 gap-6 items-center">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/15 text-accent">
              <IconBook size={16} />
            </div>
            <h3 className="text-lg font-semibold">Every ratio comes with its formula</h3>
          </div>
          <p className="text-muted-foreground text-sm mb-4">
            Hover any value to see the definition, the formula, the components it's built from, and the primary
            driver of its year-over-year move. No black boxes, no jargon left unexplained — the math is always one
            interaction away.
          </p>
          <ul className="text-sm space-y-2 text-muted-foreground">
            <li>• 30+ standardized ratios across liquidity, capital, operating, earnings quality, and profitability</li>
            <li>• Tooltip shows formula, definition, components, and the driver behind every YoY change</li>
            <li>• Structural N/As (banks, REITs, airlines) carry an explanation, not a silent blank</li>
          </ul>
        </div>
        <RatioMock />
      </Card>

      {/* Row 2 — DCF / Reverse DCF */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/15 text-accent">
            <IconCalculator size={16} />
          </div>
          <h3 className="text-lg font-semibold">DCF and Reverse DCF, side by side</h3>
        </div>
        <p className="text-muted-foreground text-sm mb-4">
          Move sliders, watch the per-share value update. Then flip the question: given the current market price,
          what assumption does the market actually need to be true? Brent's-method solver finds it.
        </p>
        <DcfMock />
      </Card>

      {/* Row 2 — Linkage */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/15 text-accent">
            <IconGitMerge size={16} />
          </div>
          <h3 className="text-lg font-semibold">See how the three statements connect</h3>
        </div>
        <p className="text-muted-foreground text-sm mb-4">
          Drag the IS, BS, and CF anywhere on a canvas. Click any linkage to open the rollforward —
          NI → Retained Earnings, ΔPP&E → CapEx, ΔCash from all three sections — with the math broken out and
          the variance line called out.
        </p>
        <LinkageMock />
      </Card>
    </div>
  </section>
);

const FEATURES = [
  {
    title: 'Built on what the filer actually said',
    body: 'Every figure traces back to a specific XBRL fact in a specific 10-K or 10-Q. No vendor reconciliations, no scraped aggregators — when you want to know where a number came from, it\'s one click away.',
  },
  {
    title: 'WACC that matches your DCF',
    body: 'Compute cost of capital from CAPM + the filings-derived effective tax rate, then pipe the result straight into the DCF discount rate. The two calculations share one tax assumption so the model stays internally consistent.',
  },
  {
    title: 'Peer-aware, without losing the single-company view',
    body: 'Toggle from a single ticker to a peer set and the same ratios re-render side by side. Common-size and segment views layer on top so you can see where revenue actually comes from.',
  },
];

const TheToolboxStrip = () => (
  <section className="border-y border-border bg-card/30">
    <div className="mx-auto max-w-6xl px-6 py-16">
      <div className="space-y-2 mb-8 max-w-3xl">
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">The framework, working</h2>
        <p className="text-muted-foreground">
          The point isn't to hide the analysis behind a number — it's to make the analysis itself the product.
          Below is what that means in practice.
        </p>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {FEATURES.map((f) => (
          <Card key={f.title} className="p-5">
            <div className="font-semibold mb-2">{f.title}</div>
            <div className="text-sm text-muted-foreground leading-relaxed">{f.body}</div>
          </Card>
        ))}
      </div>
    </div>
  </section>
);

const WorkflowStrip = () => (
  <section className="mx-auto max-w-6xl px-6 py-16">
    <div className="space-y-2 mb-8 max-w-3xl">
      <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">From ticker to thesis in three moves</h2>
      <p className="text-muted-foreground">
        No data engineering. No reconciliations. Just the work that matters.
      </p>
    </div>
    <div className="grid md:grid-cols-3 gap-4">
      {[
        { n: '01', t: 'Pull a filing', b: 'Type a US-listed ticker, pick 10-K or 10-Q, choose your period. Intrinsiq fetches the filing from EDGAR and renders the statements.' },
        { n: '02', t: 'Explore the framework', b: 'Move between Balance Sheet, IS, CF, Ratios, Common Size, DCF, and Diagram. Hover for formulas. Click linkages for rollforwards.' },
        { n: '03', t: 'Form a view', b: 'Run a DCF on your assumptions. Reverse-solve it against the current price. The gap between the two is the thesis you\'re building.' },
      ].map((s) => (
        <Card key={s.n} className="p-5">
          <div className="text-3xl font-bold text-accent/70 tabular-nums" style={{ fontFamily: "'Outfit', sans-serif" }}>{s.n}</div>
          <div className="font-semibold mt-2">{s.t}</div>
          <div className="text-sm text-muted-foreground mt-1 leading-relaxed">{s.b}</div>
        </Card>
      ))}
    </div>
  </section>
);

const FinalCTA = ({ onGetStarted }) => (
  <section className="border-t border-border bg-gradient-to-b from-background to-accent/5">
    <div className="mx-auto max-w-3xl px-6 py-20">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-accent">
          <IconTrendingUp size={24} />
        </div>
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">Start with any US-listed ticker.</h2>
        <p className="text-muted-foreground max-w-xl">
          The basics are free — no credit card. Paid plans add peer comparisons, DCF, segment-level history,
          and the AI summaries that read the 10-K for you.
        </p>
        <div className="flex flex-wrap gap-3 justify-center mt-2">
          <Button size="lg" onClick={onGetStarted}>
            Create a free account <IconArrowRight size={16} />
          </Button>
          <Button size="lg" variant="outline" onClick={onGetStarted}>
            <IconInfoCircle size={16} /> Already have one — log in
          </Button>
        </div>
      </div>
    </div>
  </section>
);

const Footer = () => (
  <footer className="border-t border-border">
    <div className="mx-auto max-w-6xl px-6 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
      <span className="text-sm text-muted-foreground">© {new Date().getFullYear()} Intrinsiq</span>
      <span className="text-xs text-muted-foreground">Data sourced from SEC EDGAR. Not investment advice.</span>
    </div>
  </footer>
);

const HomePage = () => {
  const navigate = useNavigate();
  const goLogin = () => navigate('/login');

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Hero onGetStarted={goLogin} />
      <DemoGrid />
      <TheToolboxStrip />
      <WorkflowStrip />
      <FinalCTA onGetStarted={goLogin} />
      <Footer />
    </div>
  );
};

export default HomePage;
