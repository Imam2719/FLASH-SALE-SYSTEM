'use client';

import { useEffect, useState, useCallback } from 'react';
import { Reservation, api } from '@/lib/api';

interface Props {
  reservation: Reservation;
  onExpire: () => void;
  onComplete: () => void;
}

export default function ReservationTimer({
  reservation,
  onExpire,
  onComplete,
}: Props) {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isCompleting, setIsCompleting] = useState(false);
  const [hasAlerted, setHasAlerted] = useState(false);

  // Calculate time left
  const calculateTimeLeft = useCallback(() => {
    const now = new Date().getTime();
    const expires = new Date(reservation.expiresAt).getTime();
    const diff = expires - now;
    return Math.max(0, Math.floor(diff / 1000));
  }, [reservation.expiresAt]);

  // Initialize timer from localStorage or calculate fresh
  useEffect(() => {
    const stored = localStorage.getItem(`reservation_${reservation.id}`);
    
    if (stored) {
      const data = JSON.parse(stored);
      const remaining = calculateTimeLeft();
      setTimeLeft(remaining);
    } else {
      const remaining = calculateTimeLeft();
      setTimeLeft(remaining);
      
      // Save to localStorage
      localStorage.setItem(
        `reservation_${reservation.id}`,
        JSON.stringify({
          id: reservation.id,
          productId: reservation.productId,
          quantity: reservation.quantity,
          expiresAt: reservation.expiresAt,
          status: reservation.status,
        })
      );
    }
  }, [reservation, calculateTimeLeft]);

  // Timer countdown
  useEffect(() => {
    if (reservation.status !== 'ACTIVE') {
      // Clean up localStorage if not active
      localStorage.removeItem(`reservation_${reservation.id}`);
      return;
    }

    const interval = setInterval(() => {
      const remaining = calculateTimeLeft();
      setTimeLeft(remaining);

      // Update localStorage
      const stored = localStorage.getItem(`reservation_${reservation.id}`);
      if (stored) {
        const data = JSON.parse(stored);
        data.timeLeft = remaining;
        localStorage.setItem(`reservation_${reservation.id}`, JSON.stringify(data));
      }

      // Alert when 30 seconds left (only once)
      if (remaining === 30 && !hasAlerted) {
        setHasAlerted(true);
        // Optional: Play sound or browser notification
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('⏰ Time Running Out!', {
            body: '30 seconds left to complete your purchase',
            icon: '/favicon.ico',
          });
        }
      }

      // Expired
      if (remaining === 0) {
        clearInterval(interval);
        localStorage.removeItem(`reservation_${reservation.id}`);
        setTimeout(() => onExpire(), 1000);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [reservation, calculateTimeLeft, onExpire, hasAlerted]);

  const handleComplete = async () => {
    if (timeLeft === 0) {
      alert('⏰ Reservation has expired!');
      localStorage.removeItem(`reservation_${reservation.id}`);
      onExpire();
      return;
    }

    setIsCompleting(true);
    try {
      await api.completeReservation(reservation.id);
      localStorage.removeItem(`reservation_${reservation.id}`);
      alert('✅ Purchase completed successfully!');
      onComplete();
    } catch (error: any) {
      alert(`❌ Error: ${error.message}`);
      localStorage.removeItem(`reservation_${reservation.id}`);
      onExpire();
    } finally {
      setIsCompleting(false);
    }
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const progressPercentage = (timeLeft / 120) * 100; // 120 seconds = 2 minutes

  const getStatusColor = () => {
    if (reservation.status === 'COMPLETED')
      return 'bg-gradient-to-br from-green-50 to-green-100 border-green-400';
    if (reservation.status === 'EXPIRED')
      return 'bg-gradient-to-br from-red-50 to-red-100 border-red-400';
    if (timeLeft < 30)
      return 'bg-gradient-to-br from-orange-50 to-orange-100 border-orange-400 animate-pulse';
    return 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-400';
  };

  const getTimerColor = () => {
    if (timeLeft < 30) return 'text-red-600 animate-pulse';
    if (timeLeft < 60) return 'text-orange-600';
    return 'text-blue-600';
  };

  const getProgressColor = () => {
    if (progressPercentage > 50) return 'bg-green-500';
    if (progressPercentage > 25) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div
      className={`p-6 rounded-2xl border-2 shadow-xl transform transition-all hover:scale-105 ${getStatusColor()}`}
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <p className="text-xs text-gray-500 font-medium">Reservation ID</p>
          <p className="font-mono text-sm font-bold text-gray-700">
            {reservation.id.slice(0, 8)}...
          </p>
        </div>
        <span
          className={`px-4 py-1.5 rounded-full text-xs font-bold shadow-md ${
            reservation.status === 'COMPLETED'
              ? 'bg-green-500 text-white'
              : reservation.status === 'EXPIRED'
                ? 'bg-red-500 text-white'
                : 'bg-blue-500 text-white animate-pulse'
          }`}
        >
          {reservation.status}
        </span>
      </div>

      {/* Product Info */}
      <div className="mb-4 p-3 bg-white bg-opacity-60 rounded-lg">
        <p className="text-xs text-gray-500 mb-1">Quantity</p>
        <p className="text-2xl font-bold text-gray-800">
          {reservation.quantity} {reservation.quantity > 1 ? 'items' : 'item'}
        </p>
      </div>

      {/* Timer for ACTIVE reservations */}
      {reservation.status === 'ACTIVE' && (
        <>
          {/* Countdown Timer */}
          <div className={`text-6xl font-black text-center my-6 ${getTimerColor()}`}>
            {minutes}:{seconds.toString().padStart(2, '0')}
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-300 rounded-full h-3 mb-4 overflow-hidden shadow-inner">
            <div
              className={`h-3 rounded-full transition-all duration-1000 ${getProgressColor()}`}
              style={{ width: `${progressPercentage}%` }}
            ></div>
          </div>

          {/* Warning Message */}
          {timeLeft < 30 && timeLeft > 0 && (
            <div className="mb-4 p-3 bg-red-100 border-2 border-red-400 rounded-lg animate-pulse">
              <p className="text-center text-red-700 font-bold text-sm flex items-center justify-center gap-2">
                <span className="text-xl">⚠️</span>
                <span>HURRY! Only {timeLeft} seconds left!</span>
              </p>
            </div>
          )}

          {/* Complete Purchase Button */}
          <button
            onClick={handleComplete}
            disabled={isCompleting || timeLeft === 0}
            className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-xl transition-all transform hover:scale-105 active:scale-95 shadow-lg"
          >
            {isCompleting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⏳</span> Processing...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <span>✓</span> Complete Purchase Now
              </span>
            )}
          </button>

          {/* Info Text */}
          <p className="text-center text-xs text-gray-600 mt-3">
            💾 Timer persists on page refresh
          </p>
        </>
      )}

      {/* Completed State */}
      {reservation.status === 'COMPLETED' && (
        <div className="text-center py-6">
          <div className="text-6xl mb-3 animate-bounce">✅</div>
          <p className="text-green-700 font-bold text-xl mb-2">
            Purchase Completed!
          </p>
          <p className="text-sm text-gray-600">
            Thank you for your purchase
          </p>
        </div>
      )}

      {/* Expired State */}
      {reservation.status === 'EXPIRED' && (
        <div className="text-center py-6">
          <div className="text-6xl mb-3">⏰</div>
          <p className="text-red-700 font-bold text-xl mb-2">
            Reservation Expired
          </p>
          <p className="text-sm text-gray-600">
            Stock has been restored automatically
          </p>
          <p className="text-xs text-gray-500 mt-2">
            You can reserve again from the product list
          </p>
        </div>
      )}
    </div>
  );
}