'use client';

import { useEffect, useState } from 'react';
import { Product, Reservation, api } from '@/lib/api';
import ProductCard from './ProductCard';
import ReservationTimer from './ReservationTimer';

export default function ProductList() {
  const [products, setProducts] = useState<Product[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [filter, setFilter] = useState<'all' | 'in-stock' | 'low-stock'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'stock'>('name');
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setError(null);
      const [productsData, reservationsData] = await Promise.all([
        api.getProducts(),
        api.getReservations(),
      ]);
      setProducts(productsData);
      setReservations(reservationsData);
      setLastUpdate(new Date());
    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError('Failed to load data. Retrying...');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Auto-refresh every 1 second for real-time sync
    const interval = setInterval(fetchData, 1000);
    return () => clearInterval(interval);
  }, []);

  // Filter products
  const filteredProducts = products.filter((product) => {
    if (filter === 'in-stock') return product.availableStock > 0;
    if (filter === 'low-stock') return product.availableStock > 0 && product.availableStock <= 5;
    return true;
  });

  // Sort products
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'price') return a.price - b.price;
    if (sortBy === 'stock') return b.availableStock - a.availableStock;
    return 0;
  });

  const activeReservations = reservations.filter((r) => r.status === 'ACTIVE');
  const completedReservations = reservations.filter((r) => r.status === 'COMPLETED');
  const expiredReservations = reservations.filter((r) => r.status === 'EXPIRED');

  // Calculate totals
  const totalReserved = activeReservations.reduce((sum, r) => sum + r.quantity, 0);
  const totalCompleted = completedReservations.reduce((sum, r) => sum + r.quantity, 0);
  const totalAvailableStock = products.reduce((sum, p) => sum + p.availableStock, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
        <div className="text-center">
          <div className="relative">
            <div className="animate-spin rounded-full h-24 w-24 border-4 border-gray-200 border-t-4 border-t-blue-600 mx-auto mb-6"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-4xl">⚡</span>
            </div>
          </div>
          <p className="text-2xl font-black text-gray-800 mb-2">Loading Flash Sale...</p>
          <p className="text-gray-600">Fetching products and reservations</p>
          <div className="mt-4 flex gap-1 justify-center">
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
            <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            <div className="w-2 h-2 bg-pink-600 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <div className="sticky top-0 z-40 backdrop-blur-md bg-gray-900/80 border-b border-gray-700/50">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="text-4xl animate-bounce">⚡</div>
              <div>
                <h1 className="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400">
                  Flash Sale System
                </h1>
                <p className="text-sm text-gray-400">Reserve products for 2 minutes</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/30 rounded-full">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
              <span className="text-sm font-semibold text-green-400">
                Live • {lastUpdate.toLocaleTimeString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 py-4 mt-4">
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <p className="text-red-400">{error}</p>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Active Reservations Section */}
        {activeReservations.length > 0 && (
          <div className="mb-12">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <span className="text-3xl animate-pulse">🔥</span>
                <h2 className="text-2xl md:text-3xl font-black text-white">Your Active Reservations</h2>
                <span className="text-2xl font-black text-blue-400 bg-blue-500/10 px-4 py-2 rounded-full border border-blue-500/30">
                  {activeReservations.length}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeReservations.map((reservation) => (
                <ReservationTimer
                  key={reservation.id}
                  reservation={reservation}
                  onExpire={fetchData}
                  onComplete={fetchData}
                />
              ))}
            </div>
          </div>
        )}

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12">
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg p-6 border border-blue-500/30">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-200 text-sm font-semibold">Active Reservations</p>
                <p className="text-4xl font-black text-white mt-2">{activeReservations.length}</p>
                <p className="text-blue-200 text-xs mt-1">{totalReserved} items reserved</p>
              </div>
              <span className="text-4xl opacity-20">🔥</span>
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-lg p-6 border border-green-500/30">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-200 text-sm font-semibold">Completed Purchases</p>
                <p className="text-4xl font-black text-white mt-2">{completedReservations.length}</p>
                <p className="text-green-200 text-xs mt-1">{totalCompleted} items sold</p>
              </div>
              <span className="text-4xl opacity-20">✅</span>
            </div>
          </div>

          <div className="bg-gradient-to-br from-red-600 to-red-700 rounded-lg p-6 border border-red-500/30">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-red-200 text-sm font-semibold">Expired Reservations</p>
                <p className="text-4xl font-black text-white mt-2">{expiredReservations.length}</p>
                <p className="text-red-200 text-xs mt-1">Stock restored</p>
              </div>
              <span className="text-4xl opacity-20">⏰</span>
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-lg p-6 border border-purple-500/30">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-200 text-sm font-semibold">Total Stock Available</p>
                <p className="text-4xl font-black text-white mt-2">{totalAvailableStock}</p>
                <p className="text-purple-200 text-xs mt-1">Across all products</p>
              </div>
              <span className="text-4xl opacity-20">📦</span>
            </div>
          </div>
        </div>

        {/* Products Section */}
        <div className="mb-12">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🛍️</span>
              <h2 className="text-2xl md:text-3xl font-black text-white">Available Products</h2>
              <span className="text-sm font-semibold text-gray-400">({sortedProducts.length} items)</span>
            </div>

            {/* Filters and Sort */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex gap-2">
                {(['all', 'in-stock', 'low-stock'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                      filter === f
                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg scale-105'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {f === 'all' ? '📦 All' : f === 'in-stock' ? '✅ In Stock' : '⚠️ Low Stock'}
                  </button>
                ))}
              </div>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-4 py-2 rounded-lg font-semibold text-sm bg-gray-700 border border-gray-600 text-white focus:border-purple-500 focus:outline-none cursor-pointer"
              >
                <option value="name">Sort by Name</option>
                <option value="price">Sort by Price</option>
                <option value="stock">Sort by Stock</option>
              </select>
            </div>
          </div>

          {/* Products Grid */}
          {sortedProducts.length === 0 ? (
            <div className="bg-gray-800/50 rounded-lg p-12 text-center border border-gray-700">
              <div className="text-5xl mb-4">📦</div>
              <p className="text-gray-300 text-lg font-semibold">No products match your filter</p>
              <button
                onClick={() => setFilter('all')}
                className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-all"
              >
                Show All Products
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sortedProducts.map((product) => (
                <ProductCard key={product.id} product={product} onReserve={fetchData} />
              ))}
            </div>
          )}
        </div>

        {/* Reservation History */}
        <div className="mb-12">
          <h2 className="text-2xl md:text-3xl font-black text-white mb-6 flex items-center gap-3">
            <span className="text-3xl">📋</span>
            Reservation History
          </h2>

          {reservations.length === 0 ? (
            <div className="bg-gray-800/50 rounded-lg p-16 text-center border border-gray-700 border-dashed">
              <div className="text-6xl mb-4">🛒</div>
              <p className="text-gray-300 text-xl font-bold mb-2">No reservations yet</p>
              <p className="text-gray-500">Start shopping to see your reservation history!</p>
            </div>
          ) : (
            <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-gradient-to-r from-gray-800 to-gray-700 border-b border-gray-600">
                      <th className="px-6 py-4 text-left text-xs font-black text-gray-300 uppercase tracking-wider">ID</th>
                      <th className="px-6 py-4 text-left text-xs font-black text-gray-300 uppercase tracking-wider">Product</th>
                      <th className="px-6 py-4 text-left text-xs font-black text-gray-300 uppercase tracking-wider">Qty</th>
                      <th className="px-6 py-4 text-left text-xs font-black text-gray-300 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-4 text-left text-xs font-black text-gray-300 uppercase tracking-wider">Created</th>
                      <th className="px-6 py-4 text-left text-xs font-black text-gray-300 uppercase tracking-wider">Expires</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {reservations.map((res) => (
                      <tr key={res.id} className="hover:bg-gray-700/50 transition-colors">
                        <td className="px-6 py-4 text-sm font-mono text-gray-400">{res.id.slice(0, 8)}...</td>
                        <td className="px-6 py-4 text-sm text-gray-300 font-medium">{res.productId.slice(0, 8)}...</td>
                        <td className="px-6 py-4 text-sm font-black text-white">{res.quantity}</td>
                        <td className="px-6 py-4 text-sm">
                          <span
                            className={`px-3 py-1.5 inline-flex text-xs leading-5 font-bold rounded-full ${
                              res.status === 'COMPLETED'
                                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                : res.status === 'EXPIRED'
                                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                  : 'bg-blue-500/20 text-blue-400 border border-blue-500/30 animate-pulse'
                            }`}
                          >
                            {res.status === 'COMPLETED' && '✓ '}
                            {res.status === 'EXPIRED' && '⏰ '}
                            {res.status === 'ACTIVE' && '🔥 '}
                            {res.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-400">{new Date(res.createdAt).toLocaleString()}</td>
                        <td className="px-6 py-4 text-sm text-gray-400">{new Date(res.expiresAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center space-y-2 pb-8">
          <p className="text-sm text-gray-400 flex items-center justify-center gap-2">
            <span className="animate-spin">🔄</span>
            Auto-refreshing every second
          </p>
          <p className="text-xs text-gray-500">
            💾 All timers persist across page refreshes
          </p>
        </div>
      </div>
    </div>
  );
}