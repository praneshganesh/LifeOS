/**
 * ASR / accent repairs for well-known brands.
 * Only fires when product type is clear AND the heard token is a close miss —
 * never invents a brand from a vague word.
 */

const RULES = [
  {
    brand: 'Samsung',
    when: /\b(tv|television|qled|oled|fridge|refrigerator|washer|galaxy|phone|monitor)\b/i,
    heard: /\b(sangu|samsun|sam\s*sung|samson|samsong|somsung)\b/i,
  },
  {
    brand: 'Sony',
    when: /\b(tv|television|bravia|headphones|playstation|camera)\b/i,
    heard: /\b(sonny|soni|sawny)\b/i,
  },
  {
    brand: 'LG',
    when: /\b(tv|television|oled|fridge|washer)\b/i,
    heard: /\b(el\s*gee|elgee|l\.?\s*g\.?)\b/i,
  },
  {
    brand: "De'Longhi",
    when: /\b(coffee|espresso|machine|maker)\b/i,
    heard: /\b(dilon\s*ki|dialogue|dalungi|delonghi|de\s*longhi|new\s*delhi)\b/i,
  },
  {
    brand: 'Apple',
    when: /\b(iphone|ipad|macbook|airpods|watch|mac)\b/i,
    heard: /\b(aphle|appel|aple)\b/i,
  },
];

function replaceHeard(text, heard, brand) {
  if (!text) return text;
  return text.replace(heard, (m) => {
    const rest = m.length && m === m.toUpperCase() ? brand.toUpperCase() : brand;
    return rest;
  });
}

export function repairHeardBrand(fields) {
  const name = String(fields?.name || '');
  const brand = String(fields?.brand || '');
  const blob = `${name} ${brand} ${fields?.category || ''} ${fields?.room || ''}`;
  if (!name && !brand) return fields;

  for (const rule of RULES) {
    const inType = rule.when.test(blob) || rule.when.test(name);
    const heardHit = rule.heard.test(name) || rule.heard.test(brand);
    if (!inType || !heardHit) continue;
    return {
      ...fields,
      name: replaceHeard(name, rule.heard, rule.brand) || `${rule.brand} ${name}`.trim(),
      brand: rule.brand,
    };
  }
  return fields;
}
