import api from './api';

export interface SubscriptionCreate {
  stripe_price_id: string;
}

export interface SubscriptionResponse {
  subscription_id: number;
  stripe_subscription_id: string;
  client_secret: string;
  status: string;
}

export interface SubscriptionCancel {
  subscription_id: string;
}

class SubscriptionService {
  async createSubscription(data: SubscriptionCreate): Promise<SubscriptionResponse> {
    try {
      const response = await api.post('/api/subscriptions/create', data);
      return response.data;
    } catch (error) {
      console.error('Error creating subscription:', error);
      throw error;
    }
  }

  async cancelSubscription(data: SubscriptionCancel): Promise<{ message: string }> {
    try {
      const response = await api.post('/api/subscriptions/cancel', data);
      return response.data;
    } catch (error) {
      console.error('Error canceling subscription:', error);
      throw error;
    }
  }

  async getSubscriptionStatus(): Promise<any> {
    try {
      const response = await api.get('/api/subscriptions/status');
      return response.data;
    } catch (error) {
      console.error('Error getting subscription status:', error);
      throw error;
    }
  }

  // Initialize Stripe payment
  async initializePayment(priceId: string): Promise<{ client_secret: string }> {
    try {
      const response = await api.post('/api/subscriptions/create', {
        stripe_price_id: priceId
      });
      return { client_secret: response.data.client_secret };
    } catch (error) {
      console.error('Error initializing payment:', error);
      throw error;
    }
  }

  // Handle successful payment
  async handlePaymentSuccess(paymentIntentId: string): Promise<void> {
    try {
      await api.post('/api/subscriptions/payment-success', {
        payment_intent_id: paymentIntentId
      });
    } catch (error) {
      console.error('Error handling payment success:', error);
      throw error;
    }
  }
}

export const subscriptionService = new SubscriptionService(); 