// Numeric calibration is local configuration, established from an actual device
// snapshot plus operator-visible UC mode. Never infer it from the mix's name.
export function resolveMode(raw: unknown, labels: unknown, verifiedAuxMode: number | null): string | null {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(labels) && typeof raw === 'number' && Number.isInteger(raw)) {
    const label = labels[raw];
    return typeof label === 'string' ? label : null;
  }
  return verifiedAuxMode !== null && typeof raw === 'number' && raw === verifiedAuxMode ? 'Aux' : null;
}
