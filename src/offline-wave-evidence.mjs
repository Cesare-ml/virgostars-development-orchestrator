// Both inputs MUST have passed verifyWaveReport() first. The verifier rejects
// unknown fields, accessors and hidden metadata, and checks every safety field.
// Canonicalizing only the top-level key order avoids spurious --repeat failures
// when equivalent synthetic reports are constructed in a different order.
export function canonicalVerifiedWaveReport(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(report))) {
    throw new Error('Invalid verified synthetic wave report.');
  }
  const canonical = Object.create(null);
  for (const key of Object.keys(report).sort()) {
    const descriptor = Object.getOwnPropertyDescriptor(report, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') ||
        !descriptor.enumerable) {
      throw new Error('Invalid verified synthetic wave descriptor.');
    }
    canonical[key] = descriptor.value;
  }
  return JSON.stringify(canonical);
}

export function sameVerifiedWaveReport(left, right) {
  return canonicalVerifiedWaveReport(left) === canonicalVerifiedWaveReport(right);
}
