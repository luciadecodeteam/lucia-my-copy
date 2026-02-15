import React, { useMemo, useState, useEffect } from 'react';
import { useAuthToken } from '../hooks/useAuthToken';
import { startCheckout, stripeEnabled, cancelSubscription } from '../lib/api';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import '../styles/pricing.css';

const PLANS = [
  { key: 'WEEKLY',  tier: 'weekly',  name: 'Weekly',  price: '€9.99',  note: 'Unlimited messages', priceId: import.meta.env.VITE_STRIPE_PRICE_WEEKLY || 'price_1St7fI2NCNcgXLO11a8SiV4f' },
  { key: 'MONTHLY', tier: 'monthly', name: 'Monthly', price: '€19.99', note: 'Unlimited messages', priceId: import.meta.env.VITE_STRIPE_PRICE_MONTHLY || 'price_1St7no2NCNcgXLO1cn0oJQpj' },
];

export default function Pricing({ onClose }) {
  const { user } = useAuthToken();
  const enabled = useMemo(() => stripeEnabled(), []);
  const [profile, setProfile] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    
    async function loadProfile() {
      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setProfile(docSnap.data());
      }
    }
    
    loadProfile();
  }, [user?.uid]);

  const currentTier = profile?.tier || 'free';
  const isSubscribed = currentTier === 'weekly' || currentTier === 'monthly';

  async function buy(plan) {
    if (!user?.uid) {
      window.dispatchEvent(new CustomEvent('lucia:show-login'));
      return;
    }
    if (!enabled) {
      alert('Checkout is temporarily unavailable. Please try again later.');
      return;
    }
    if (!plan?.priceId || plan.priceId.includes('PLACEHOLDER')) {
      alert('This plan is not configured yet. Please contact support.');
      return;
    }

    await startCheckout({
      price: plan.priceId,
      quantity: 1,
      metadata: { uid: user.uid, email: user.email || '' }
    });
  }

  async function handleCancel() {
    if (!confirm('Cancel your subscription? You will retain access until the end of your current billing period.')) {
      return;
    }

    setCancelling(true);
    try {
      await cancelSubscription({ uid: user.uid });
      alert('Subscription cancelled successfully. You can continue using the service until the end of your billing period.');
      window.location.reload();
    } catch (err) {
      alert('Failed to cancel: ' + err.message);
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="pricing-overlay">
      <div className="pricing-panel" role="dialog" aria-modal="true" aria-label="Pricing and Plans">
        <div className="pricing-header">
          <h3 className="pricing-title">Pricing & Plans</h3>
          <button className="pricing-close" aria-label="Close" onClick={onClose}>✕</button>
        </div>

        <p className="pricing-subtext">
          EUR • Cancel anytime • No subscription trial.
        </p>

        {isSubscribed && (
          <div className="current-plan">
            <strong>Current Plan:</strong> {currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}
            <button 
              className="cancel-btn" 
              onClick={handleCancel}
              disabled={cancelling}
            >
              {cancelling ? 'Cancelling...' : 'Cancel Subscription'}
            </button>
          </div>
        )}

        <div className="plan-grid">
          {PLANS.map((p) => (
            <div key={p.key} className="plan-card">
              <div className="plan-name">{p.name}</div>
              <div className="plan-price">{p.price}</div>
              <div className="plan-note">{p.note}</div>
              <button
                className="plan-cta"
                disabled={!enabled || isSubscribed}
                title={enabled ? `Choose ${p.name}` : 'Checkout currently unavailable'}
                onClick={() => buy(p)}
              >
                {isSubscribed ? 'Already Subscribed' : enabled ? `Choose ${p.name}` : 'Checkout disabled'}
              </button>
            </div>
          ))}
        </div>

        <div className="pricing-footnote">
          {isSubscribed 
            ? 'Your subscription will remain active until the end of the current billing period after cancellation.'
            : 'Manage or cancel later via Account → Billing once subscribed.'
          }
        </div>
      </div>
    </div>
  );
}