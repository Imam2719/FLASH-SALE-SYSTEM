'use client';

import { useState } from 'react';
import { Product, api } from '@/lib/api';

interface Props {
  product: Product;
  onReserve: () => void;
}

export default function ProductCard({ product, onReserve }: Props) {
  const [quantity, setQuantity] = useState(1);
  const [isReserving, setIsReserving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReserve = async () => {
    setError(null);

    if (quantity > product.availableStock) {
      setError(`Only ${product.availableStock} items available!`);
      return;
    }

    if (quantity < 1) {
      setError('Quantity must be at least 1');
      return;
    }

    setIsReserving(true);
    try {
      await api.createReservation(product.id, quantity);

      // Show success animation
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);

      onReserve();
      setQuantity(1);
    } catch (error: any) {
      setError(error.message || 'Failed to create reservation');
      onReserve();
    } finally {
      setIsReserving(false);
    }
  };

  const stockPercentage = (product.availableStock / product.totalStock) * 100;

  const getStockStatus = () => {
    if (product.availableStock === 0) {
      return {
        text: 'Out of Stock',
        badgeColor: 'bg-red-500/20 text-red-400 border-red-500/30',
        progressColor: 'bg-red-500',
        icon: '🚫',
      };
    }
    if (product.availableStock <= 5) {
      return {
        text: `Only ${product.availableStock} Left!`,
        badgeColor: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
        progressColor: 'bg-yellow-500',
        icon: '⚠️',
      };
    }
    return {
      text: `${product.availableStock} Available`,
      badgeColor: 'bg-green-500/20 text-green-400 border-green-500/30',
      progressColor: 'bg-green-500',
      icon: '✅',
    };
  };

  const stockStatus = getStockStatus();

  const getProductEmoji = (name: string) => {
    if (name.toLowerCase().includes('iphone') || name.toLowerCase().includes('phone')) return '📱';
    if (name.toLowerCase().includes('ipad') || name.toLowerCase().includes('tablet')) return '📱';
    if (name.toLowerCase().includes('macbook') || name.toLowerCase().includes('laptop')) return '💻';
    if (name.toLowerCase().includes('airpods') || name.toLowerCase().includes('headphone')) return '🎧';
    if (name.toLowerCase().includes('watch')) return '⌚';
    return '📦';
  };

  return (
    <div className="relative group h-full">
      {/* Success Animation Overlay */}
      {showSuccess && (
        <div className="absolute inset-0 bg-gradient-to-br from-green-500 to-emerald-500 rounded-2xl z-50 flex items-center justify-center shadow-2xl">
          <div className="text-center">
            <div className="text-7xl mb-3 animate-bounce">✅</div>
            <p className="text-white text-2xl font-black">Reserved!</p>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="absolute top-2 right-2 z-40 bg-red-500/20 border border-red-500/50 rounded-lg p-2 text-red-400 text-xs font-semibold max-w-[200px] animate-slideInRight">
          {error}
        </div>
      )}

      {/* Main Card */}
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700/50 rounded-2xl p-6 shadow-2xl hover:shadow-3xl hover:border-purple-500/50 transition-all duration-300 transform group-hover:-translate-y-2 relative overflow-hidden h-full flex flex-col">
        {/* Background Glow Effect */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 via-purple-600/10 to-pink-600/10 blur-2xl"></div>
        </div>

        {/* Hot Badge */}
        {product.availableStock <= 5 && product.availableStock > 0 && (
          <div className="absolute top-4 right-4 z-10">
            <span className="bg-red-500 text-white text-xs font-black px-3 py-1 rounded-full animate-pulse shadow-lg">
              HOT 🔥
            </span>
          </div>
        )}

        {/* Product Icon */}
        <div className="flex items-center justify-center mb-6 h-32 bg-gradient-to-br from-gray-700 to-gray-800 rounded-xl group-hover:scale-110 transition-transform duration-300 border border-gray-600/50">
          <span className="text-7xl drop-shadow-lg">{getProductEmoji(product.name)}</span>
        </div>

        {/* Product Name */}
        <h3 className="text-lg font-black text-white group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-blue-400 group-hover:to-purple-400 transition-all line-clamp-2 min-h-[3rem] mb-3">
          {product.name}
        </h3>

        {/* Price */}
        <div className="mb-4">
          <p className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-400">
            ${Number(product.price).toFixed(2)}
          </p>
          <p className="text-xs text-gray-400 font-semibold mt-1">Flash Sale Price</p>
        </div>

        {/* Stock Info */}
        <div className="mb-5 space-y-3 flex-grow">
          {/* Stock Badge */}
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold border ${stockStatus.badgeColor} shadow-sm`}>
            <span>{stockStatus.icon}</span>
            <span>{stockStatus.text}</span>
          </div>

          {/* Stock Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs font-semibold text-gray-400">
              <span>Stock Level</span>
              <span>
                {product.availableStock} / {product.totalStock}
              </span>
            </div>
            <div className="w-full bg-gray-700/50 rounded-full h-3 overflow-hidden shadow-inner border border-gray-600/30">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${stockStatus.progressColor} shadow-lg`}
                style={{ width: `${stockPercentage}%` }}
              >
                {stockPercentage > 10 && (
                  <div className="h-full flex items-center justify-end pr-1">
                    <span className="text-[10px] text-white font-bold drop-shadow">
                      {Math.round(stockPercentage)}%
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Quantity Selector */}
        <div className="mb-4">
          <label className="block text-xs font-black text-gray-300 mb-2">Select Quantity:</label>
          <div className="flex items-center gap-2 bg-gray-700/30 p-2 rounded-lg border border-gray-600/30">
            <button
              type="button"
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              disabled={product.availableStock === 0 || quantity <= 1}
              className="w-9 h-9 rounded-lg bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:cursor-not-allowed font-black text-lg transition-all transform active:scale-95 text-gray-200 hover:text-white"
            >
              −
            </button>

            <input
              type="number"
              min="1"
              max={product.availableStock}
              value={quantity}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 1;
                setQuantity(Math.min(Math.max(1, val), product.availableStock));
              }}
              className="flex-1 border-0 bg-transparent text-center text-lg font-black text-white focus:outline-none"
              disabled={product.availableStock === 0}
            />

            <button
              type="button"
              onClick={() => setQuantity(Math.min(product.availableStock, quantity + 1))}
              disabled={product.availableStock === 0 || quantity >= product.availableStock}
              className="w-9 h-9 rounded-lg bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:cursor-not-allowed font-black text-lg transition-all transform active:scale-95 text-gray-200 hover:text-white"
            >
              +
            </button>
          </div>
        </div>

        {/* Reserve Button */}
        <button
          onClick={handleReserve}
          disabled={isReserving || product.availableStock === 0}
          className={`w-full py-4 px-6 rounded-xl font-black text-lg transition-all transform shadow-xl ${
            product.availableStock === 0
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white hover:scale-105 active:scale-95 hover:shadow-2xl'
          } ${isReserving ? 'animate-pulse' : ''}`}
        >
          {isReserving ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin">⏳</span>
              Reserving...
            </span>
          ) : product.availableStock === 0 ? (
            <span className="flex items-center justify-center gap-2">
              <span>🚫</span>
              Out of Stock
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <span>🛒</span>
              Reserve Now (2 min)
            </span>
          )}
        </button>

        {/* Info Text */}
        {product.availableStock > 0 && (
          <p className="text-center text-xs text-gray-500 mt-3 font-semibold">
            ⏱️ Hold for 2 minutes • Complete or auto-restore
          </p>
        )}
      </div>
    </div>
  );
}