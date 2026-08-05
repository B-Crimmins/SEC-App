import { useState, useEffect, useMemo } from 'react';
import {
  IconCheck, IconCircleCheck, IconLock, IconSparkles, IconX,
} from '@tabler/icons-react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import axios from 'axios';
import { useNavigate, useSearchParams } from 'react-router-dom';
import globalConfig from '../../global/globalConfig.json';
import { Badge } from '../../src/components/ui/badge';
import { Button } from '../../src/components/ui/button';
import { Card } from '../../src/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../src/components/ui/dialog';
import { Separator } from '../../src/components/ui/separator';
import { ScrollArea } from '../../src/components/ui/scroll-area';
import { Spinner } from '../../src/components/ui/spinner';
import { cn } from '../../src/lib/utils';
import { setSessionIsPro } from '../../Utilities/subscription';
import classes from './StripePage.module.css';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

const FREE_FEATURES = [
  '10 API calls per month',
  'Basic financial data access',
  'Standard CSV export',
  'Company search',
  'Basic financial reports',
];
const FREE_LIMITS = [
  'No AI-powered analysis',
  'Limited data retention',
  'Standard processing speed',
  'No priority support',
];
const PRO_FEATURES = [
  '1,000 API calls per month',
  'AI-powered analysis & summaries',
  'Multi-period trend analysis',
  'Priority processing',
  'Extended data retention',
  'Advanced CSV export',
  'Peer group analysis',
  'Priority customer support',
];

const FeatureLine = ({ text, included }) => (
  <div className="flex items-center gap-2">
    {included
      ? <IconCheck size={14} className="shrink-0 text-gain" />
      : <IconX size={14} className="shrink-0 text-muted-foreground" />}
    <span className={cn('text-sm', !included && 'text-muted-foreground')}>{text}</span>
  </div>
);

const PAYMENT_ELEMENT_OPTIONS = {
  layout: {
    type: 'tabs',
    defaultCollapsed: false,
  },
};

const CheckoutForm = ({ onSuccess }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setErrorMsg('');

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/Subscriptions?success=true`,
      },
      redirect: 'if_required',
    });

    if (error) {
      setErrorMsg(error.message || 'Payment failed. Please try again.');
      setLoading(false);
    } else {
      const token = sessionStorage.getItem('token');
      if (paymentIntent?.id && token) {
        try {
          await axios.post(
            `${globalConfig.appUrl}/api/subscriptions/payment-success`,
            { payment_intent_id: paymentIntent.id },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          setSessionIsPro(true);
        } catch {
          // Webhook is authoritative; this is a best-effort fallback.
          setSessionIsPro(true);
        }
      } else {
        setSessionIsPro(true);
      }
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1 pr-1">
        <div className="w-full min-w-0 pb-4">
          <PaymentElement options={PAYMENT_ELEMENT_OPTIONS} />
        </div>
      </ScrollArea>

      <div className="shrink-0 space-y-3 border-t border-border pt-4">
        {errorMsg && (
          <p className="text-sm text-loss">{errorMsg}</p>
        )}
        <Button
          type="submit"
          disabled={loading || !stripe}
          className="w-full border-0 bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:from-blue-600 hover:to-cyan-600"
        >
          {loading ? (
            <>
              <Spinner size="sm" className="text-white" />
              Processing…
            </>
          ) : (
            'Subscribe — $29 / month'
          )}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Secured by Stripe · Cancel anytime
        </p>
      </div>
    </form>
  );
};

const StripePage = () => {
  const [selected, setSelected] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [clientSecret, setClientSecret] = useState(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      setSuccess(true);
    }
  }, [searchParams]);

  const openModal = async () => {
    const token = sessionStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    setModalOpen(true);
    setClientSecret(null);
    setCreateError('');
    setCreateLoading(true);

    try {
      const res = await axios.post(
        `${globalConfig.appUrl}/api/subscriptions/create`,
        { stripe_price_id: import.meta.env.VITE_STRIPE_PRICE_ID_PRO },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setClientSecret(res.data.client_secret);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setCreateError(detail || 'Failed to initialize payment. Please try again.');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleSuccess = () => {
    setSuccess(true);
    setModalOpen(false);
  };

  const elementsOptions = useMemo(
    () =>
      clientSecret
        ? {
            clientSecret,
            appearance: {
              theme: 'night',
              variables: {
                colorPrimary: '#5c94ff',
                colorBackground: '#111724',
                colorText: '#e7ecf5',
                borderRadius: '8px',
                fontFamily: 'Inter, system-ui, sans-serif',
              },
            },
          }
        : null,
    [clientSecret]
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 md:py-16">
      {success && (
        <Card className={cn('mb-8 p-6', classes.successCard)}>
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gain/15 text-gain">
              <IconCircleCheck size={28} />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">You&apos;re now on Pro!</h3>
              <p className="text-sm text-muted-foreground">
                All Pro features are unlocked. Enjoy 1,000 API calls per month.
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="mb-12 space-y-3 text-center">
        <h1
          className="text-3xl font-semibold tracking-tight md:text-4xl"
          style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
        >
          Choose Your Plan
        </h1>
        <p className="mx-auto max-w-lg text-muted-foreground">
          Start free with core features. Upgrade when you need AI analysis, peer comparisons, and higher limits.
        </p>
      </div>

      <div className="grid items-stretch gap-6 md:grid-cols-2 md:gap-8">
        {/* Free */}
        <Card
          className={cn(
            classes.planCard,
            'flex cursor-pointer flex-col p-6 shadow-md',
            selected === 'free' && classes.selected
          )}
          onClick={() => setSelected('free')}
        >
          <div className="flex items-start justify-between">
            <h2 className="text-2xl font-semibold">Free</h2>
            {selected === 'free' && (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gain text-white">
                <IconCheck size={14} />
              </span>
            )}
          </div>

          <p className={cn('mt-2 text-3xl font-bold', classes.cardTitle)}>
            $0{' '}
            <span className="text-base font-normal text-muted-foreground">/ month</span>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Great for getting started with financial data
          </p>

          <Separator className="my-5" />

          <div className="space-y-2">
            {FREE_FEATURES.map((f) => <FeatureLine key={f} text={f} included />)}
          </div>

          <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Limitations
          </p>
          <div className="space-y-2">
            {FREE_LIMITS.map((f) => <FeatureLine key={f} text={f} included={false} />)}
          </div>

          <Button
            variant="outline"
            className="mt-auto w-full"
            onClick={(e) => { e.stopPropagation(); navigate('/login'); }}
          >
            Get started for free
          </Button>
        </Card>

        {/* Pro */}
        <div className="relative flex flex-col">
          <Badge className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 gap-1 border-transparent bg-primary px-3 py-1 text-primary-foreground">
            <IconSparkles size={12} />
            Most Popular
          </Badge>

          <Card
            className={cn(
              classes.planCard,
              classes.proCard,
              'flex h-full cursor-pointer flex-col p-6 shadow-md',
              selected === 'pro' && classes.selected
            )}
            onClick={() => setSelected('pro')}
          >
            <div className="flex items-start justify-between">
              <h2 className="text-2xl font-semibold">Pro</h2>
              {selected === 'pro' && (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <IconCheck size={14} />
                </span>
              )}
            </div>

            <p className={cn('mt-2 text-3xl font-bold', classes.cardTitle)}>
              $29{' '}
              <span className="text-base font-normal text-muted-foreground">/ month</span>
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Advanced tools for professional analysis
            </p>

            <Separator className="my-5" />

            <div className="space-y-2">
              {PRO_FEATURES.map((f) => <FeatureLine key={f} text={f} included />)}
            </div>

            <Button
              className="mt-auto w-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:from-blue-600 hover:to-cyan-600 border-0"
              onClick={(e) => { e.stopPropagation(); openModal(); }}
            >
              Subscribe Now
            </Button>
          </Card>
        </div>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent
          className={cn(
            'top-[5vh] flex w-[calc(100%-2rem)] max-w-xl translate-y-0 flex-col gap-0 overflow-hidden p-0',
            'max-h-[90vh] sm:rounded-xl'
          )}
        >
          <DialogHeader className="shrink-0 space-y-0 border-b border-border px-6 py-4 pr-12">
            <DialogTitle className="flex items-center gap-2 text-left">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                <IconLock size={16} />
              </span>
              Subscribe to Pro
            </DialogTitle>
          </DialogHeader>

          <div className="shrink-0 space-y-4 border-b border-border px-6 py-4">
            <Card className="p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">Pro Subscription</span>
                <Badge variant="secondary">$29 / month</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                1,000 API calls · AI analysis · Priority support · Cancel anytime
              </p>
            </Card>

            <div className="relative py-1">
              <Separator />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                Enter payment details
              </span>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col px-6 py-4">
            {createLoading && (
              <div className="flex flex-col items-center gap-2 py-8">
                <Spinner size="lg" className="text-primary" />
                <p className="text-sm text-muted-foreground">Preparing secure checkout…</p>
              </div>
            )}

            {createError && (
              <Card className="border-loss/30 bg-loss/5 p-4">
                <p className="text-sm text-loss">{createError}</p>
              </Card>
            )}

            {clientSecret && elementsOptions && (
              <Elements stripe={stripePromise} options={elementsOptions}>
                <CheckoutForm onSuccess={handleSuccess} />
              </Elements>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StripePage;
