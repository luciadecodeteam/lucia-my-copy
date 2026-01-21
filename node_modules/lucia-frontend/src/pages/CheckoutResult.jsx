import React, { useMemo } from 'react';
import '../styles/checkout.css';

function useSessionId() {
  return useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('session_id');
    } catch (_err) {
      return null;
    }
  }, []);
}

function ResultLayout({ title, message, cta }) {
  return (
    <div className="checkout-result">
      <div className="checkout-card" role="status" aria-live="polite">
        <h1>{title}</h1>
        {message}
        <div className="checkout-actions">
          {cta}
        </div>
      </div>
    </div>
  );
}

export function CheckoutSuccess() {
  const sessionId = useSessionId();

  return (
    <ResultLayout
      title="Payment successful"
      message={(
        <>
          <p>Thank you! Your plan is being activated. You can return to the app and start chatting right away.</p>
          {sessionId && (
            <p>
              Confirmation code:
              <br />
              <code>{sessionId}</code>
            </p>
          )}
        </>
      )}
      cta={(
        <>
          <a href="/" aria-label="Go back to Lucía">Go to Lucía</a>
          <a className="secondary" href="mailto:lucia.decode@proton.me">Need help?</a>
        </>
      )}
    />
  );
}

export function CheckoutCancel() {
  return (
    <ResultLayout
      title="Checkout canceled"
      message={<p>No worries — your card was not charged. You can resume the checkout whenever you’re ready.</p>}
      cta={(
        <>
          <a href="/" aria-label="Return to Lucía">Back to Lucía</a>
          <a className="secondary" href="mailto:lucia.decode@proton.me">Contact support</a>
        </>
      )}
    />
  );
}
