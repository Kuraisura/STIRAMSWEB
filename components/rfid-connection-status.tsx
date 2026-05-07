'use client';

import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, RefreshCw, Database } from 'lucide-react';

interface DbStatusResponse {
  status: 'ok' | 'error';
  connected: boolean;
  message?: string;
}

export default function RFIDConnectionStatus() {
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState('');
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/status/database', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Failed to fetch local database status');
      }

      const data: DbStatusResponse = await response.json();
      setConnected(Boolean(data.connected));
      setMessage(data.message || (data.connected ? 'Local PostgreSQL is reachable.' : 'Local PostgreSQL is not reachable.'));
      setLastCheckedAt(new Date().toLocaleString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setConnected(false);
      setMessage('Local PostgreSQL connection could not be verified.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-center space-x-2">
          <RefreshCw className="h-5 w-5 animate-spin text-blue-500" />
          <span className="text-gray-600">Loading local database status...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center space-x-3 mb-4">
          <XCircle className="h-6 w-6 text-red-500" />
          <h3 className="text-lg font-semibold text-gray-900">RFID Local Status</h3>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Local Database Error</h3>
              <div className="mt-2 text-sm text-red-700">{error}</div>
            </div>
          </div>
        </div>
        <button
          onClick={fetchStatus}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Recheck
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <Database className="h-6 w-6 text-blue-500" />
          <h3 className="text-lg font-semibold text-gray-900">RFID Local Status</h3>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Recheck
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
          <Database className="h-5 w-5 text-blue-500" />
          <div className="flex-1">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-gray-900">Local PostgreSQL</span>
              {connected ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
            </div>
            <div className="text-xs text-gray-500 mt-1">{connected ? 'Connected' : 'Not connected'}</div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
          <div className="text-sm font-medium text-blue-900">Status Message</div>
          <div className="mt-2 text-sm text-blue-700">{message}</div>
          {lastCheckedAt && (
            <div className="mt-2 text-xs text-blue-600">Last checked: {lastCheckedAt}</div>
          )}
        </div>
      </div>

      {!connected && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Local database unavailable</h3>
              <div className="mt-2 text-sm text-red-700">
                Check whether PostgreSQL is running on localhost:5432 and verify DB credentials in .env.local.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 
