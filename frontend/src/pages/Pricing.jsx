import React, { useMemo } from 'react';
import { useAuthToken } from '../hooks/useAuthToken';
import { startCheckout, stripeEnabled } from '../lib/api';
import '../styles/pricing.css';

const PLANS = [
  { key: 'WEEKLY',  tier: 'weekly',  name: 'Weekly',  price: '€4.99',  note: 'Unlimited messages', priceId: import.meta.env.VITE_STRIPE_PRICE_WEEKLY || 'price_WEEKLY_PLACEHOLDER' },
  { key: 'MONTHLY', tier: 'monthly', name: 'Monthly', price: '€14.99', note: 'Unlimited messages', priceId: import.meta.env.VITE_STRIPE_PRICE_MONTHLY || 'price_MONTHLY_PLACEHOLDER' },
];

export default function Pricing({ onClose }) {
  const { user } = useAuthToken();
  const enabled = useMemo(() => stripeEnabled(), []);

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

    // ✅ Send Stripe price id (no Authorization header; handled in api.js)
    await startCheckout({
      price: plan.priceId,
      quantity: 1,
      metadata: { uid: user.uid, email: user.email || '' }
    });
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

        <div className="plan-grid">
          {PLANS.map((p) => (
            <div key={p.key} className="plan-card">
              <div className="plan-name">{p.name}</div>
              <div className="plan-price">{p.price}</div>
              <div className="plan-note">{p.note}</div>
              <button
                className="plan-cta"
                disabled={!enabled}
                title={enabled ? `Choose ${p.name}` : 'Checkout currently unavailable'}
                onClick={() => buy(p)}
              >
                {enabled ? `Choose ${p.name}` : 'Checkout disabled'}
              </button>
            </div>
          ))}
        </div>

        <div className="pricing-footnote">
          Manage or cancel later via <strong>Account → Billing</strong> once Stripe is connected.
        </div>
      </div>
    </div>
  );
}
