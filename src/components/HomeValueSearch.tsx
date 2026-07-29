import { useState } from 'react';
import { HOME_VALUE_PROXY_URL } from '../config';

interface AvmResult {
  price: number;
  priceRangeLow?: number;
  priceRangeHigh?: number;
}

const fmt = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/**
 * Address → estimated home value + range.
 * Calls a server-side RentCast proxy (HOME_VALUE_PROXY_URL). The proxy keeps the
 * RentCast API key server-side and returns RentCast /avm/value JSON:
 *   { price, priceRangeLow, priceRangeHigh, ... }
 * If no proxy is configured, shows a setup notice instead of failing.
 */
export default function HomeValueSearch() {
  const [address, setAddress] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error' | 'unconfigured'>('idle');
  const [result, setResult] = useState<AvmResult | null>(null);

  const search = async () => {
    if (!address.trim()) return;
    if (!HOME_VALUE_PROXY_URL) { setStatus('unconfigured'); return; }
    setStatus('loading');
    setResult(null);
    try {
      const r = await fetch(`${HOME_VALUE_PROXY_URL}?address=${encodeURIComponent(address.trim())}`);
      if (!r.ok) throw new Error('bad response');
      const d = await r.json();
      const price = Number(d.price ?? d.value ?? 0);
      if (!price) throw new Error('no value');
      setResult({
        price,
        priceRangeLow: d.priceRangeLow ?? d.valueLow,
        priceRangeHigh: d.priceRangeHigh ?? d.valueHigh,
      });
      setStatus('done');
    } catch {
      setStatus('error');
    }
  };

  return (
    <div
      style={{
        background: 'var(--light-bg, #f5f7f9)',
        border: '1px solid #e5e8eb',
        borderRadius: 12,
        padding: 20,
        marginBottom: 28,
      }}
    >
      <div style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>
        What's your home worth?
      </div>
      <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: '0 0 12px' }}>
        Enter your address to see an instant estimated value, then find out how much equity you can tap.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          type="text"
          className="form-input"
          style={{ flex: '1 1 260px' }}
          placeholder="123 Main St, Los Angeles, CA 90001"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
        />
        <button type="button" className="btn btn-teal" onClick={search} disabled={status === 'loading'}>
          {status === 'loading' ? 'Checking…' : 'Get My Estimate'}
        </button>
      </div>

      {status === 'done' && result && (
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Estimated market value</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--navy)' }}>{fmt(result.price)}</div>
          {result.priceRangeLow && result.priceRangeHigh && (
            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              Range: {fmt(result.priceRangeLow)} – {fmt(result.priceRangeHigh)}
            </div>
          )}
          <p style={{ fontSize: '0.85rem', color: 'var(--text-dark)', marginTop: 10 }}>
            Want to know how much of that you can access with a HELOC or HEI? Enter your info below and Darren will send your options.
          </p>
        </div>
      )}

      {status === 'error' && (
        <p style={{ marginTop: 12, fontSize: '0.85rem', color: '#a5293f' }}>
          Couldn't find that address. Double-check it, or just enter your info below and Darren will pull it manually.
        </p>
      )}

      {status === 'unconfigured' && (
        <p style={{ marginTop: 12, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Home-value lookup isn't connected yet. Enter your info below and Darren will send your estimate personally.
          {/* Set VITE_HOME_VALUE_PROXY_URL to a RentCast proxy to enable instant estimates. */}
        </p>
      )}
    </div>
  );
}
