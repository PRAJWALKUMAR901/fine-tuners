import type { RiskBand, VerificationTier } from '../types/mobility';

export function formatClock(simMinutes: number): string {
  const total = ((Math.round(simMinutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function formatCurrency(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

export function formatMinutes(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

export function formatPercent(fraction: number, digits = 0): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function formatKm(km: number): string {
  return `${km.toFixed(1)} km`;
}

export function titleCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function verificationLabel(tier: VerificationTier): string {
  switch (tier) {
    case 'ID-verified':
      return 'ID verified';
    case 'Depot-registered':
      return 'Depot registered';
    case 'Community-vouched':
      return 'Community vouched';
    default:
      return 'Unverified';
  }
}

export function riskBand(risk: number): RiskBand {
  if (risk >= 1) return 'critical';
  if (risk > 0.85) return 'high';
  if (risk >= 0.6) return 'medium';
  return 'low';
}

export function riskTone(risk: number): { bg: string; text: string; ring: string; label: string } {
  const band = riskBand(risk);
  switch (band) {
    case 'critical':
      return { bg: 'bg-red-50', text: 'text-red-800', ring: 'ring-red-200', label: 'Critical' };
    case 'high':
      return { bg: 'bg-orange-50', text: 'text-orange-800', ring: 'ring-orange-200', label: 'High' };
    case 'medium':
      return { bg: 'bg-amber-50', text: 'text-amber-800', ring: 'ring-amber-200', label: 'Medium' };
    default:
      return { bg: 'bg-emerald-50', text: 'text-emerald-800', ring: 'ring-emerald-200', label: 'Low' };
  }
}

export function dispatchStatusLabel(status: string): string {
  return titleCase(status);
}

export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
