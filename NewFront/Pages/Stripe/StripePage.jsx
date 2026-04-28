import { useState, useEffect, useMemo } from 'react';
import {
  Badge, Box, Button, Card, Center, Container, Divider,
  Group, Loader, Modal, SimpleGrid, Stack, Text, ThemeIcon, Title,
} from '@mantine/core';
import {
  IconCheck, IconCircleCheck, IconLock, IconSparkles, IconX,
} from '@tabler/icons-react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import axios from 'axios';
import { useNavigate, useSearchParams } from 'react-router-dom';
import globalConfig from '../../global/globalConfig.json';
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
  <Group gap="xs" align="center">
    {included
      ? <IconCheck size={14} color="var(--mantine-color-gain-5)" />
      : <IconX size={14} color="var(--mantine-color-dimmed)" />}
    <Text fz="sm" c={included ? undefined : 'dimmed'}>{text}</Text>
  </Group>
);

// ---------- Stripe checkout form (rendered inside <Elements>) ----------
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

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/Stripe?success=true`,
      },
      redirect: 'if_required',
    });

    if (error) {
      setErrorMsg(error.message || 'Payment failed. Please try again.');
      setLoading(false);
    } else {
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      {errorMsg && (
        <Text c="red.5" size="sm" mt="sm">{errorMsg}</Text>
      )}
      <Button
        type="submit"
        loading={loading}
        fullWidth
        mt="lg"
        size="md"
        variant="gradient"
        gradient={{ from: 'blue', to: 'cyan', deg: 90 }}
      >
        Subscribe — $29 / month
      </Button>
      <Text size="xs" c="dimmed" ta="center" mt="xs">
        Secured by Stripe · Cancel anytime
      </Text>
    </form>
  );
};

// ---------- Main page ----------
const StripePage = () => {
  const [selected, setSelected] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [clientSecret, setClientSecret] = useState(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Handle redirect back from 3-D Secure
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
              variables: { colorPrimary: '#3c74d5', borderRadius: '8px' },
            },
          }
        : null,
    [clientSecret]
  );

  return (
    <>
      <Container size="lg" py="xl">
        {success && (
          <Card withBorder mb="xl" p="lg" radius="md" className={classes.successCard}>
            <Group gap="md" justify="center">
              <ThemeIcon color="gain" size={48} radius="xl" variant="light">
                <IconCircleCheck size={28} />
              </ThemeIcon>
              <Stack gap={2}>
                <Title order={3}>You&apos;re now on Pro!</Title>
                <Text c="dimmed" size="sm">All Pro features are unlocked. Enjoy 1,000 API calls per month.</Text>
              </Stack>
            </Group>
          </Card>
        )}

        <Title order={1} ta="center">Choose Your Plan</Title>
        <Text ta="center" c="dimmed" mt="sm" maw={500} mx="auto">
          Start free with core features. Upgrade when you need AI analysis, peer comparisons, and higher limits.
        </Text>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing={{ base: 'md', sm: 'xl' }} mt={50} style={{ alignItems: 'stretch' }}>

          {/* Free card */}
          <Card
            withBorder
            shadow="md"
            radius="md"
            padding="xl"
            h="100%"
            style={{ display: 'flex', flexDirection: 'column' }}
            className={`${classes.planCard} ${selected === 'free' ? classes.selected : ''}`}
            onClick={() => setSelected('free')}
          >
            <Group justify="space-between" align="flex-start">
              <Text fz="h2" fw={600}>Free</Text>
              {selected === 'free' && (
                <ThemeIcon color="gain" radius="xl" size={24} variant="filled">
                  <IconCheck size={14} />
                </ThemeIcon>
              )}
            </Group>
            <Text fz="h2" fw={700} className={classes.cardTitle} mt="xs">
              $0 <Text component="span" fz="md" fw={400} c="dimmed">/ month</Text>
            </Text>
            <Text fz="sm" c="dimmed" mt="xs">Great for getting started with financial data</Text>

            <Divider my="md" />

            <Stack gap="xs" mb="xs">
              {FREE_FEATURES.map((f) => <FeatureLine key={f} text={f} included />)}
            </Stack>

            <Text fz="xs" fw={600} tt="uppercase" c="dimmed" mt="md" mb="xs" style={{ letterSpacing: '0.06em' }}>
              Limitations
            </Text>
            <Stack gap="xs">
              {FREE_LIMITS.map((f) => <FeatureLine key={f} text={f} included={false} />)}
            </Stack>

            <Button
              variant="outline"
              fullWidth
              mt="auto"
              onClick={(e) => { e.stopPropagation(); navigate('/login'); }}
            >
              Get started for free
            </Button>
          </Card>

          {/* Pro card */}
          <Box style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
            <Badge
              size="lg"
              variant="filled"
              color="intrinsiq"
              style={{
                position: 'absolute',
                top: -12,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 1,
              }}
            >
              <Group gap={4}><IconSparkles size={12} /> Most Popular</Group>
            </Badge>

            <Card
              withBorder
              shadow="md"
              radius="md"
              padding="xl"
              h="100%"
              style={{ display: 'flex', flexDirection: 'column' }}
              className={`${classes.planCard} ${classes.proCard} ${selected === 'pro' ? classes.selected : ''}`}
              onClick={() => setSelected('pro')}
            >
              <Group justify="space-between" align="flex-start">
                <Text fz="h2" fw={600}>Pro</Text>
                {selected === 'pro' && (
                  <ThemeIcon color="intrinsiq" radius="xl" size={24} variant="filled">
                    <IconCheck size={14} />
                  </ThemeIcon>
                )}
              </Group>
              <Text fz="h2" fw={700} className={classes.cardTitle} mt="xs">
                $29 <Text component="span" fz="md" fw={400} c="dimmed">/ month</Text>
              </Text>
              <Text fz="sm" c="dimmed" mt="xs">Advanced tools for professional analysis</Text>

              <Divider my="md" />

              <Stack gap="xs">
                {PRO_FEATURES.map((f) => <FeatureLine key={f} text={f} included />)}
              </Stack>

              <Button
                variant="gradient"
                gradient={{ from: 'blue', to: 'cyan', deg: 90 }}
                fullWidth
                mt="auto"
                onClick={(e) => { e.stopPropagation(); openModal(); }}
              >
                Subscribe Now
              </Button>
            </Card>
          </Box>
        </SimpleGrid>
      </Container>

      {/* Payment modal */}
      <Modal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        title={
          <Group gap="xs">
            <ThemeIcon variant="light" color="intrinsiq" size={32} radius="md">
              <IconLock size={16} />
            </ThemeIcon>
            <Text fw={600}>Subscribe to Pro</Text>
          </Group>
        }
        centered
        size="md"
        overlayProps={{ blur: 3 }}
      >
        <Stack gap="md">
          <Card withBorder radius="md" p="sm">
            <Group justify="space-between" align="center">
              <Text fw={600}>Pro Subscription</Text>
              <Badge variant="light" color="intrinsiq" size="lg">$29 / month</Badge>
            </Group>
            <Text size="xs" c="dimmed" mt={4}>
              1,000 API calls · AI analysis · Priority support · Cancel anytime
            </Text>
          </Card>

          <Divider label="Enter payment details" labelPosition="center" />

          {createLoading && (
            <Center py="xl">
              <Stack align="center" gap="xs">
                <Loader color="intrinsiq" />
                <Text size="sm" c="dimmed">Preparing secure checkout…</Text>
              </Stack>
            </Center>
          )}

          {createError && (
            <Card withBorder radius="md" p="sm" bg="dark.7">
              <Text c="red.5" size="sm">{createError}</Text>
            </Card>
          )}

          {clientSecret && elementsOptions && (
            <Elements stripe={stripePromise} options={elementsOptions}>
              <CheckoutForm onSuccess={handleSuccess} />
            </Elements>
          )}
        </Stack>
      </Modal>
    </>
  );
};

export default StripePage;
