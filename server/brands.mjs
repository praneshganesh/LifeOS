/**
 * Optional brand field normalize — intentional no-op.
 * ASR/brand spelling is the model's job (see chat system prompt), not a regex map.
 */
export function repairHeardBrand(fields) {
  return fields;
}
