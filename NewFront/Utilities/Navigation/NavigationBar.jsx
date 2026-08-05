import { useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import { IconArrowRight, IconLogout } from '@tabler/icons-react';
import { Logo } from '../../src/components/Logo';
import { Button } from '../../src/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '../../src/components/ui/sheet';
import { useLocation, useNavigate } from 'react-router-dom';

const NavigationBar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // sessionStorage isn't reactive — re-evaluate on every route change so the
  // bar swaps to the signed-in chrome the moment we land back on `/`.
  const [signedIn, setSignedIn] = useState(() => !!sessionStorage.getItem('token'));
  useEffect(() => {
    setSignedIn(!!sessionStorage.getItem('token'));
  }, [location.pathname]);

  // Hide the marketing chrome inside the authenticated app shell.
  if (location.pathname.startsWith('/AppHome')) return null;

  const goHome = () => navigate('/');
  const goLogin = () => {
    setDrawerOpen(false);
    navigate('/login');
  };
  const goApp = () => {
    setDrawerOpen(false);
    navigate('/AppHome');
  };
  const signOut = () => {
    setDrawerOpen(false);
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    setSignedIn(false);
    navigate('/');
  };

  return (
    <div className="pb-[70px]">
      <header className="fixed top-0 left-0 right-0 z-40 h-[60px] px-4 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="flex h-full items-center justify-between">
          <button
            type="button"
            onClick={goHome}
            aria-label="Intrinsiq home"
            className="flex items-center gap-2 cursor-pointer bg-transparent border-0 p-0 m-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            <Logo size={28} color="hsl(var(--accent))" />
            <span
              className="text-xl font-bold tracking-tight text-accent transition-opacity hover:opacity-80"
              style={{ fontFamily: "'Outfit', system-ui, sans-serif", letterSpacing: '-0.01em' }}
            >
              Intrinsiq
            </span>
          </button>

          <div className="hidden sm:flex items-center gap-2">
            {signedIn ? (
              <>
                <Button size="sm" onClick={goApp}>
                  Go to app <IconArrowRight size={14} />
                </Button>
                <Button variant="ghost" size="sm" onClick={signOut}>
                  <IconLogout size={14} /> Sign out
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={goLogin}>Log in</Button>
                <Button size="sm" onClick={goLogin}>Sign up</Button>
              </>
            )}
          </div>

          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="sm:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[80vw]">
              <SheetHeader>
                <SheetTitle>Intrinsiq</SheetTitle>
              </SheetHeader>
              <div className="mt-8 flex flex-col gap-2">
                {signedIn ? (
                  <>
                    <Button onClick={goApp}>Go to app</Button>
                    <Button variant="outline" onClick={signOut}>Sign out</Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={goLogin}>Log in</Button>
                    <Button onClick={goLogin}>Sign up</Button>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>
    </div>
  );
};

export default NavigationBar;
