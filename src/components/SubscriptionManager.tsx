import React, { useState, useEffect } from 'react';
import { CreditCard, AlertTriangle, XCircle } from 'lucide-react';
import { subscriptionService } from '../services/subscriptionService';

interface SubscriptionStatus {
  has_subscription: boolean;
  tier: string;
  subscription?: {
    id: number;
    stripe_subscription_id: string;
    status: string;
    current_period_start: string;
    current_period_end: string;
    stripe_status: string;
    cancel_at_period_end: boolean;
  };
}

const SubscriptionManager: React.FC = () => {
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    fetchSubscriptionStatus();
  }, []);

  const fetchSubscriptionStatus = async () => {
    try {
      const status = await subscriptionService.getSubscriptionStatus();
      setSubscription(status);
    } catch (error) {
      console.error('Error fetching subscription status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!subscription?.subscription) return;

    if (!confirm('Are you sure you want to cancel your subscription? You will lose access to Pro features at the end of your current billing period.')) {
      return;
    }

    setCancelling(true);
    try {
      await subscriptionService.cancelSubscription({
        subscription_id: subscription.subscription.stripe_subscription_id
      });
      alert('Subscription cancelled successfully. You will have access until the end of your current billing period.');
      fetchSubscriptionStatus(); // Refresh status
    } catch (error) {
      alert('Error cancelling subscription. Please try again.');
    } finally {
      setCancelling(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="text-center">
          <XCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Subscription Found</h3>
          <p className="text-gray-600">You don't have an active subscription.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center mb-6">
        <CreditCard className="h-6 w-6 text-primary-600 mr-2" />
        <h3 className="text-xl font-semibold text-gray-900">Subscription Status</h3>
      </div>

      {/* Current Plan */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-lg font-medium text-gray-900">
              {subscription.tier === 'paid' ? 'Pro Plan' : 'Free Plan'}
            </h4>
            <p className="text-gray-600">
              {subscription.tier === 'paid' ? 'Full access to all features' : 'Limited access to basic features'}
            </p>
          </div>
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${
            subscription.tier === 'paid' 
              ? 'bg-green-100 text-green-800' 
              : 'bg-gray-100 text-gray-800'
          }`}>
            {subscription.tier === 'paid' ? 'Active' : 'Free'}
          </div>
        </div>
      </div>

      {/* Subscription Details */}
      {subscription.has_subscription && subscription.subscription && (
        <div className="space-y-4 mb-6">
          <div className="border-t border-gray-200 pt-4">
            <h5 className="font-medium text-gray-900 mb-3">Subscription Details</h5>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Status</p>
                <p className="font-medium text-gray-900 capitalize">
                  {subscription.subscription.status}
                </p>
              </div>
              
              <div>
                <p className="text-sm text-gray-600">Stripe Status</p>
                <p className="font-medium text-gray-900 capitalize">
                  {subscription.subscription.stripe_status}
                </p>
              </div>
              
              <div>
                <p className="text-sm text-gray-600">Current Period Start</p>
                <p className="font-medium text-gray-900">
                  {formatDate(subscription.subscription.current_period_start)}
                </p>
              </div>
              
              <div>
                <p className="text-sm text-gray-600">Current Period End</p>
                <p className="font-medium text-gray-900">
                  {formatDate(subscription.subscription.current_period_end)}
                </p>
              </div>
            </div>

            {subscription.subscription.cancel_at_period_end && (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <div className="flex items-center">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 mr-2" />
                  <p className="text-yellow-800 text-sm">
                    Your subscription will be cancelled at the end of the current billing period.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="border-t border-gray-200 pt-4">
        {subscription.tier === 'paid' && subscription.subscription && (
          <div className="space-y-3">
            {!subscription.subscription.cancel_at_period_end && (
              <button
                onClick={handleCancelSubscription}
                disabled={cancelling}
                className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cancelling ? 'Cancelling...' : 'Cancel Subscription'}
              </button>
            )}
            
            <a
              href="/pricing"
              className="block w-full text-center bg-gray-100 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-200"
            >
              View Plans
            </a>
          </div>
        )}
        
        {subscription.tier === 'free' && (
          <a
            href="/pricing"
            className="block w-full text-center bg-primary-600 text-white py-2 px-4 rounded-md hover:bg-primary-700"
          >
            Upgrade to Pro
          </a>
        )}
      </div>
    </div>
  );
};

export default SubscriptionManager; 