import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { IconArrowLeft, IconUser } from '@tabler/icons-react';
import globalConfig from '../../global/globalConfig.json';
import { Alert, AlertDescription } from '../../src/components/ui/alert';
import { Badge } from '../../src/components/ui/badge';
import { Button } from '../../src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../src/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../src/components/ui/dialog';
import { Separator } from '../../src/components/ui/separator';
import { Skeleton } from '../../src/components/ui/skeleton';
import { Spinner } from '../../src/components/ui/spinner';

const authHeaders = () => ({
  Authorization: `Bearer ${sessionStorage.getItem('token')}`,
});

const formatDate = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const planLabel = (isPro) => (isPro ? 'Pro' : 'Free');

const statusBadgeVariant = (status) => {
  if (status === 'active') return 'success';
  if (status === 'cancelled') return 'muted';
  if (status === 'past_due' || status === 'unpaid') return 'warning';
  return 'secondary';
};

const DetailRow = ({ label, value }) => (
  <div className="flex items-start justify-between gap-4 py-2.5">
    <span className="text-sm text-muted-foreground">{label}</span>
    <span className="text-sm font-medium text-right">{value}</span>
  </div>
);

const AccountPage = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [subscriptionData, setSubscriptionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [cancelSuccess, setCancelSuccess] = useState('');

  const fetchAccount = useCallback(async () => {
    const token = sessionStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [userRes, subRes] = await Promise.all([
        axios.get(`${globalConfig.appUrl}/auth/me`, { headers: authHeaders() }),
        axios.get(`${globalConfig.appUrl}/api/subscriptions/status`, { headers: authHeaders() }),
      ]);
      setUser(userRes.data);
      setSubscriptionData(subRes.data);

      if (subRes.data?.card_last4 && userRes.data && !userRes.data.card_last4) {
        setUser({ ...userRes.data, card_last4: subRes.data.card_last4 });
      }

      const cached = sessionStorage.getItem('user');
      if (cached) {
        const parsed = JSON.parse(cached);
        const { tier: _removed, ...rest } = parsed;
        sessionStorage.setItem(
          'user',
          JSON.stringify({ ...rest, is_pro: subRes.data?.is_pro === true })
        );
      }
    } catch (err) {
      if (err.response?.status === 401) {
        navigate('/login');
        return;
      }
      setError(err.response?.data?.detail || 'Failed to load account information.');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    fetchAccount();
  }, [fetchAccount]);

  const subscription = subscriptionData?.subscription;
  const cardLast4 = user?.card_last4 || subscriptionData?.card_last4;
  const isPro = subscriptionData?.is_pro === true;
  const isActiveSubscription =
    subscription?.status === 'active' || subscription?.stripe_status === 'active';
  const canCancel =
    subscriptionData?.has_subscription &&
    isActiveSubscription &&
    !subscription?.cancel_at_period_end;
  const periodEndDate = subscription?.current_period_end;

  const handleCancel = async () => {
    if (!subscription?.id) return;

    setCancelLoading(true);
    setCancelError('');

    try {
      const res = await axios.post(
        `${globalConfig.appUrl}/api/subscriptions/cancel`,
        { subscription_id: subscription.id },
        { headers: authHeaders() }
      );
      setCancelOpen(false);
      const endDate = res.data?.current_period_end;
      setCancelSuccess(
        endDate
          ? `You'll keep Pro access until ${formatDate(endDate)}. Your subscription will not renew after that.`
          : 'Your subscription is set to cancel at the end of the billing period.'
      );
      await fetchAccount();
    } catch (err) {
      setCancelError(err.response?.data?.detail || 'Failed to cancel subscription.');
    } finally {
      setCancelLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="iconSm" onClick={() => navigate('/AppHome')} aria-label="Back to app">
          <IconArrowLeft size={18} />
        </Button>
        <div className="flex items-center gap-2">
          <IconUser size={22} className="text-accent" />
          <h1 className="text-xl font-semibold">My Account</h1>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {cancelSuccess && (
        <Alert variant="info" className="mb-4">
          <AlertDescription>{cancelSuccess}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : (
              <>
                <DetailRow label="Email" value={user?.email} />
                <Separator />
                <DetailRow label="Username" value={user?.username} />
                <Separator />
                <DetailRow label="Member since" value={formatDate(user?.created_at)} />
                <Separator />
                <DetailRow
                  label="Plan"
                  value={(
                    <Badge variant={isPro ? 'success' : 'secondary'}>
                      {planLabel(isPro)}
                    </Badge>
                  )}
                />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Subscription</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : subscriptionData?.has_subscription && subscription ? (
              <>
                <DetailRow
                  label="Status"
                  value={(
                    <Badge variant={statusBadgeVariant(subscription.status)}>
                      {subscription.cancel_at_period_end ? 'Cancelling' : subscription.status}
                    </Badge>
                  )}
                />
                <Separator />
                <DetailRow label="Current period start" value={formatDate(subscription.current_period_start)} />
                <Separator />
                <DetailRow label="Current period end" value={formatDate(subscription.current_period_end)} />
                {cardLast4 && (
                  <>
                    <Separator />
                    <DetailRow label="Card on file" value={`•••• ${cardLast4}`} />
                  </>
                )}

                {subscription.cancel_at_period_end && (
                  <p className="mt-4 text-sm text-muted-foreground">
                    You&apos;ll keep Pro access until {formatDate(periodEndDate)}. Your subscription will not renew after that.
                  </p>
                )}

                {canCancel && (
                  <div className="mt-6">
                    <Button variant="outline" onClick={() => setCancelOpen(true)}>
                      Cancel subscription
                    </Button>
                  </div>
                )}

                {!isPro && !canCancel && (
                  <div className="mt-6">
                    <Button onClick={() => navigate('/Subscriptions')}>Upgrade to Pro</Button>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  You are on the Free plan. Upgrade to Pro for expanded API access and AI-powered analysis.
                </p>
                <Button onClick={() => navigate('/Subscriptions')}>View plans</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel subscription?</DialogTitle>
            <DialogDescription>
              {periodEndDate
                ? `You'll keep Pro access until ${formatDate(periodEndDate)}. Your subscription will not renew after that date.`
                : 'Your subscription will stay active until the end of the current billing period, then will not renew.'}
            </DialogDescription>
          </DialogHeader>

          {cancelError && (
            <Alert variant="destructive">
              <AlertDescription>{cancelError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={cancelLoading}>
              Keep subscription
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={cancelLoading}>
              {cancelLoading ? (
                <>
                  <Spinner size="sm" />
                  Cancelling…
                </>
              ) : (
                'Confirm cancellation'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AccountPage;
