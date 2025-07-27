import React, { useState, useEffect } from 'react';
import { User, CreditCard, Activity, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import SubscriptionManager from '../components/SubscriptionManager';
import api from '../services/api';

interface UsageInfo {
  current_usage: number;
  limit: number;
  remaining: number;
  exceeded: boolean;
  tier: string;
}

const Profile: React.FC = () => {
  const { user, logout } = useAuth();
  const [usageInfo, setUsageInfo] = useState<UsageInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsageInfo();
  }, []);

  const fetchUsageInfo = async () => {
    try {
      const response = await api.get('/api/subscriptions/usage');
      setUsageInfo(response.data);
    } catch (error) {
      console.error('Error fetching usage info:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-8"></div>
            <div className="h-64 bg-gray-200 rounded mb-6"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Profile</h1>
          <p className="text-gray-600">Manage your account and subscription</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* User Information */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center mb-6">
              <User className="h-6 w-6 text-primary-600 mr-2" />
              <h2 className="text-xl font-semibold text-gray-900">Account Information</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Username</label>
                <p className="mt-1 text-gray-900">{user?.username}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <p className="mt-1 text-gray-900">{user?.email}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Account Type</label>
                <p className="mt-1 text-gray-900 capitalize">{user?.tier}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Member Since</label>
                <p className="mt-1 text-gray-900">
                  {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                </p>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200">
              <button
                onClick={handleLogout}
                className="flex items-center text-red-600 hover:text-red-700"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </button>
            </div>
          </div>

          {/* Usage Information */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center mb-6">
              <Activity className="h-6 w-6 text-primary-600 mr-2" />
              <h2 className="text-xl font-semibold text-gray-900">API Usage</h2>
            </div>

            {usageInfo && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Current Usage</label>
                  <p className="mt-1 text-gray-900">
                    {usageInfo.current_usage} / {usageInfo.limit} calls
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Remaining</label>
                  <p className="mt-1 text-gray-900">
                    {usageInfo.remaining} calls
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Status</label>
                  <div className="mt-1">
                    {usageInfo.exceeded ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        Limit Exceeded
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Within Limits
                      </span>
                    )}
                  </div>
                </div>

                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      usageInfo.exceeded ? 'bg-red-600' : 'bg-green-600'
                    }`}
                    style={{
                      width: `${Math.min((usageInfo.current_usage / usageInfo.limit) * 100, 100)}%`
                    }}
                  ></div>
                </div>
              </div>
            )}

            <div className="mt-6 pt-6 border-t border-gray-200">
              <a
                href="/pricing"
                className="flex items-center text-primary-600 hover:text-primary-700"
              >
                <CreditCard className="h-4 w-4 mr-2" />
                View Plans
              </a>
            </div>
          </div>
        </div>

        {/* Subscription Management */}
        <div className="mt-8">
          <SubscriptionManager />
        </div>
      </div>
    </div>
  );
};

export default Profile; 