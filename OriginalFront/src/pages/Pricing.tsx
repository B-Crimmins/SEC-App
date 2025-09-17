import React, { useState, useEffect } from 'react';
import { Check, X, Star, Zap, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import StripePayment from '../components/StripePayment';

interface PricingTier {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  limitations: string[];
  popular?: boolean;
  stripe_price_id?: string;
}

const Pricing: React.FC = () => {
  const {isAuthenticated } = useAuth();
  const [usageLimits, setUsageLimits] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showPayment, setShowPayment] = useState(false);
  const [selectedTier, setSelectedTier] = useState<PricingTier | null>(null);

  useEffect(() => {
    const fetchUsageLimits = async () => {
      try {
        const response = await api.get('/api/usage-limits');
        setUsageLimits(response.data);
      } catch (error) {
        console.error('Error fetching usage limits:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsageLimits();
  }, []);

  const pricingTiers: PricingTier[] = [
    {
      name: 'Free',
      price: '$0',
      period: 'month',
      description: 'Perfect for getting started with financial data analysis',
      features: [
        `${usageLimits?.free_tier?.monthly_limit || 5} API calls per month`,
        'Basic financial data access',
        'Standard CSV export',
        'Company search functionality',
        'Basic financial reports'
      ],
      limitations: [
        'No AI-powered analysis',
        'Limited data retention',
        'Standard processing speed',
        'No priority support'
      ]
    },
    {
      name: 'Pro',
      price: '$29',
      period: 'month',
      description: 'Advanced features for professional financial analysis',
      features: [
        `${usageLimits?.paid_tier?.monthly_limit || 1000} API calls per month`,
        'Advanced AI-powered analysis',
        'Multi-period trend analysis',
        'Priority processing',
        'Extended data retention',
        'Advanced CSV export',
        'Peer group analysis',
        'Priority customer support'
      ],
      limitations: [],
      popular: true,
      stripe_price_id: 'price_1OqX8X2eZvKYlo2C1QqX2eZv' // You'll need to replace with actual Stripe price ID
    }
  ];

  const handleSubscribe = async (tier: PricingTier) => {
    if (tier.name === 'Free') {
      // Free tier doesn't need subscription
      return;
    }

    if (!isAuthenticated) {
      // Redirect to sign-up with payment page
      const params = new URLSearchParams({
        priceId: tier.stripe_price_id || '',
        amount: tier.price.replace('$', ''),
        planName: tier.name
      });
      window.location.href = `/signup-payment?${params.toString()}`;
      return;
    }

    setSelectedTier(tier);
    setShowPayment(true);
  };

  const handlePaymentSuccess = () => {
    setShowPayment(false);
    setSelectedTier(null);
    alert('Subscription created successfully! You now have access to Pro features.');
    // Optionally refresh the page or update user state
    window.location.reload();
  };

  const handlePaymentError = (error: string) => {
    alert(`Payment failed: ${error}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (showPayment && selectedTier) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-md mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Subscribe to {selectedTier.name}
              </h2>
              <p className="text-gray-600">
                Complete your subscription to unlock all Pro features
              </p>
            </div>

            <StripePayment
              priceId={selectedTier.stripe_price_id!}
              amount={29}
              onSuccess={handlePaymentSuccess}
              onError={handlePaymentError}
            />

            <button
              onClick={() => setShowPayment(false)}
              className="w-full mt-4 text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Choose Your Plan
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Get access to powerful financial analysis tools. Start free and upgrade when you need more features.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {pricingTiers.map((tier, index) => (
            <div
              key={index}
              className={`relative bg-white rounded-lg shadow-lg p-8 ${
                tier.popular ? 'ring-2 ring-primary-500' : ''
              }`}
            >
              {tier.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <span className="bg-primary-500 text-white px-4 py-1 rounded-full text-sm font-medium">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">{tier.name}</h3>
                <div className="flex items-baseline justify-center mb-4">
                  <span className="text-4xl font-bold text-gray-900">{tier.price}</span>
                  <span className="text-gray-600 ml-1">/{tier.period}</span>
                </div>
                <p className="text-gray-600">{tier.description}</p>
              </div>

              {/* Features */}
              <div className="space-y-4 mb-8">
                <h4 className="font-semibold text-gray-900 mb-3">What's included:</h4>
                <ul className="space-y-3">
                  {tier.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-start">
                      <Check className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Limitations */}
              {tier.limitations.length > 0 && (
                <div className="space-y-4 mb-8">
                  <h4 className="font-semibold text-gray-900 mb-3">Limitations:</h4>
                  <ul className="space-y-3">
                    {tier.limitations.map((limitation, limitationIndex) => (
                      <li key={limitationIndex} className="flex items-start">
                        <X className="h-5 w-5 text-red-500 mr-3 mt-0.5 flex-shrink-0" />
                        <span className="text-gray-700">{limitation}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* CTA Button */}
              <button
                onClick={() => handleSubscribe(tier)}
                className={`w-full py-3 px-6 rounded-lg font-medium transition-colors ${
                  tier.popular
                    ? 'bg-primary-600 text-white hover:bg-primary-700'
                    : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                }`}
              >
                {tier.name === 'Free' ? 'Get Started Free' : 'Subscribe Now'}
              </button>
            </div>
          ))}
        </div>

        {/* Additional Info */}
        <div className="mt-16 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Why Choose SEC Wrapper?
          </h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="bg-primary-100 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Zap className="h-8 w-8 text-primary-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Fast & Reliable</h3>
              <p className="text-gray-600">
                Get real-time financial data from the SEC with our optimized API
              </p>
            </div>
            <div className="text-center">
              <div className="bg-primary-100 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Star className="h-8 w-8 text-primary-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">AI-Powered Analysis</h3>
              <p className="text-gray-600">
                Advanced AI analysis provides insights you can't get anywhere else
              </p>
            </div>
            <div className="text-center">
              <div className="bg-primary-100 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Shield className="h-8 w-8 text-primary-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Secure & Private</h3>
              <p className="text-gray-600">
                Your data is protected with enterprise-grade security
              </p>
            </div>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="mt-16 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Can I cancel my subscription anytime?
              </h3>
              <p className="text-gray-600">
                Yes, you can cancel your subscription at any time. You'll continue to have access until the end of your current billing period.
              </p>
            </div>
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                What happens if I exceed my API limits?
              </h3>
              <p className="text-gray-600">
                Free tier users will be temporarily blocked until the next month. Pro users get priority processing and higher limits.
              </p>
            </div>
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Is my financial data secure?
              </h3>
              <p className="text-gray-600">
                Absolutely. We use bank-level encryption and never store sensitive financial information. All data is processed securely.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Pricing; 