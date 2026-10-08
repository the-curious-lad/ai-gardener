'use strict';

const ai = require('../ai');
const { RouterDecisionSchema, normalizeSeason } = require('../../models/schemas');
const { SYSTEM_PROMPT, buildUserPrompt } = require('../../prompts/queryRewriter.prompt');
const logger = require('../../utils/logger');

// ── Known City -> State/Country Mapping for Climate Hierarchy Resolution ─────
const KNOWN_CITY_STATE_MAP = {
  gorakhpur: { city: 'Gorakhpur', state: 'Uttar Pradesh', country: 'India' },
  lucknow: { city: 'Lucknow', state: 'Uttar Pradesh', country: 'India' },
  varanasi: { city: 'Varanasi', state: 'Uttar Pradesh', country: 'India' },
  kanpur: { city: 'Kanpur', state: 'Uttar Pradesh', country: 'India' },
  prayagraj: { city: 'Prayagraj', state: 'Uttar Pradesh', country: 'India' },
  agra: { city: 'Agra', state: 'Uttar Pradesh', country: 'India' },
  noida: { city: 'Noida', state: 'Uttar Pradesh', country: 'India' },
  shimla: { city: 'Shimla', state: 'Himachal Pradesh', country: 'India' },
  manali: { city: 'Manali', state: 'Himachal Pradesh', country: 'India' },
  dharamshala: { city: 'Dharamshala', state: 'Himachal Pradesh', country: 'India' },
  solan: { city: 'Solan', state: 'Himachal Pradesh', country: 'India' },
  kullu: { city: 'Kullu', state: 'Himachal Pradesh', country: 'India' },
  hamirpur: { city: 'Hamirpur', state: 'Himachal Pradesh', country: 'India' },
  mandi: { city: 'Mandi', state: 'Himachal Pradesh', country: 'India' },
  kangra: { city: 'Kangra', state: 'Himachal Pradesh', country: 'India' },
  una: { city: 'Una', state: 'Himachal Pradesh', country: 'India' },
  bilaspur: { city: 'Bilaspur', state: 'Himachal Pradesh', country: 'India' },
  chamba: { city: 'Chamba', state: 'Himachal Pradesh', country: 'India' },
  palampur: { city: 'Palampur', state: 'Himachal Pradesh', country: 'India' },
  sirmaur: { city: 'Sirmaur', state: 'Himachal Pradesh', country: 'India' },
  nahan: { city: 'Nahan', state: 'Himachal Pradesh', country: 'India' },
  baddi: { city: 'Baddi', state: 'Himachal Pradesh', country: 'India' },
  kasauli: { city: 'Kasauli', state: 'Himachal Pradesh', country: 'India' },
  dalhousie: { city: 'Dalhousie', state: 'Himachal Pradesh', country: 'India' },
  dehradun: { city: 'Dehradun', state: 'Uttarakhand', country: 'India' },
  nainital: { city: 'Nainital', state: 'Uttarakhand', country: 'India' },
  haridwar: { city: 'Haridwar', state: 'Uttarakhand', country: 'India' },
  rishikesh: { city: 'Rishikesh', state: 'Uttarakhand', country: 'India' },
  roorkee: { city: 'Roorkee', state: 'Uttarakhand', country: 'India' },
  haldwani: { city: 'Haldwani', state: 'Uttarakhand', country: 'India' },
  srinagar: { city: 'Srinagar', state: 'Jammu and Kashmir', country: 'India' },
  jammu: { city: 'Jammu', state: 'Jammu and Kashmir', country: 'India' },
  pune: { city: 'Pune', state: 'Maharashtra', country: 'India' },
  mumbai: { city: 'Mumbai', state: 'Maharashtra', country: 'India' },
  nagpur: { city: 'Nagpur', state: 'Maharashtra', country: 'India' },
  nashik: { city: 'Nashik', state: 'Maharashtra', country: 'India' },
  aurangabad: { city: 'Aurangabad', state: 'Maharashtra', country: 'India' },
  bengaluru: { city: 'Bengaluru', state: 'Karnataka', country: 'India' },
  bangalore: { city: 'Bengaluru', state: 'Karnataka', country: 'India' },
  mysuru: { city: 'Mysuru', state: 'Karnataka', country: 'India' },
  mangaluru: { city: 'Mangaluru', state: 'Karnataka', country: 'India' },
  jodhpur: { city: 'Jodhpur', state: 'Rajasthan', country: 'India' },
  jaipur: { city: 'Jaipur', state: 'Rajasthan', country: 'India' },
  udaipur: { city: 'Udaipur', state: 'Rajasthan', country: 'India' },
  bikaner: { city: 'Bikaner', state: 'Rajasthan', country: 'India' },
  kota: { city: 'Kota', state: 'Rajasthan', country: 'India' },
  ajmer: { city: 'Ajmer', state: 'Rajasthan', country: 'India' },
  chennai: { city: 'Chennai', state: 'Tamil Nadu', country: 'India' },
  coimbatore: { city: 'Coimbatore', state: 'Tamil Nadu', country: 'India' },
  madurai: { city: 'Madurai', state: 'Tamil Nadu', country: 'India' },
  guwahati: { city: 'Guwahati', state: 'Assam', country: 'India' },
  dibrugarh: { city: 'Dibrugarh', state: 'Assam', country: 'India' },
  patna: { city: 'Patna', state: 'Bihar', country: 'India' },
  gaya: { city: 'Gaya', state: 'Bihar', country: 'India' },
  muzaffarpur: { city: 'Muzaffarpur', state: 'Bihar', country: 'India' },
  kolkata: { city: 'Kolkata', state: 'West Bengal', country: 'India' },
  darjeeling: { city: 'Darjeeling', state: 'West Bengal', country: 'India' },
  siliguri: { city: 'Siliguri', state: 'West Bengal', country: 'India' },
  delhi: { city: 'Delhi', state: 'Delhi', country: 'India' },
  gurgaon: { city: 'Gurgaon', state: 'Haryana', country: 'India' },
  gurugram: { city: 'Gurugram', state: 'Haryana', country: 'India' },
  faridabad: { city: 'Faridabad', state: 'Haryana', country: 'India' },
  chandigarh: { city: 'Chandigarh', state: 'Punjab', country: 'India' },
  ludhiana: { city: 'Ludhiana', state: 'Punjab', country: 'India' },
  amritsar: { city: 'Amritsar', state: 'Punjab', country: 'India' },
  jalandhar: { city: 'Jalandhar', state: 'Punjab', country: 'India' },
  patiala: { city: 'Patiala', state: 'Punjab', country: 'India' },
  bhopal: { city: 'Bhopal', state: 'Madhya Pradesh', country: 'India' },
  indore: { city: 'Indore', state: 'Madhya Pradesh', country: 'India' },
  gwalior: { city: 'Gwalior', state: 'Madhya Pradesh', country: 'India' },
  jabalpur: { city: 'Jabalpur', state: 'Madhya Pradesh', country: 'India' },
  ahmedabad: { city: 'Ahmedabad', state: 'Gujarat', country: 'India' },
  surat: { city: 'Surat', state: 'Gujarat', country: 'India' },
  vadodara: { city: 'Vadodara', state: 'Gujarat', country: 'India' },
  rajkot: { city: 'Rajkot', state: 'Gujarat', country: 'India' },
  hyderabad: { city: 'Hyderabad', state: 'Telangana', country: 'India' },
  warangal: { city: 'Warangal', state: 'Telangana', country: 'India' },
  visakhapatnam: { city: 'Visakhapatnam', state: 'Andhra Pradesh', country: 'India' },
  vijayawada: { city: 'Vijayawada', state: 'Andhra Pradesh', country: 'India' },
  kochi: { city: 'Kochi', state: 'Kerala', country: 'India' },
  thiruvananthapuram: { city: 'Thiruvananthapuram', state: 'Kerala', country: 'India' },
  kozhikode: { city: 'Kozhikode', state: 'Kerala', country: 'India' },
  bhubaneswar: { city: 'Bhubaneswar', state: 'Odisha', country: 'India' },
  cuttack: { city: 'Cuttack', state: 'Odisha', country: 'India' },
  raipur: { city: 'Raipur', state: 'Chhattisgarh', country: 'India' },
  ranchi: { city: 'Ranchi', state: 'Jharkhand', country: 'India' },
  jamshedpur: { city: 'Jamshedpur', state: 'Jharkhand', country: 'India' },
  fresno: { city: 'Fresno', state: 'California', country: 'United States' },
  phoenix: { city: 'Phoenix', state: 'Arizona', country: 'United States' },
  miami: { city: 'Miami', state: 'Florida', country: 'United States' },
  chicago: { city: 'Chicago', state: 'Illinois', country: 'United States' },
  seattle: { city: 'Seattle', state: 'Washington', country: 'United States' },
  ithaca: { city: 'Ithaca', state: 'New York', country: 'United States' },
  nairobi: { city: 'Nairobi', state: 'Nairobi County', country: 'Kenya' },
  cairo: { city: 'Cairo', state: 'Cairo Governorate', country: 'Egypt' },
};

const INDIAN_STATES = [
  'Himachal Pradesh', 'Uttar Pradesh', 'Maharashtra', 'Karnataka', 'Rajasthan',
  'Tamil Nadu', 'Assam', 'Bihar', 'West Bengal', 'Punjab', 'Haryana',
  'Uttarakhand', 'Jammu and Kashmir', 'Madhya Pradesh', 'Gujarat', 'Telangana',
  'Andhra Pradesh', 'Kerala', 'Odisha', 'Chhattisgarh', 'Jharkhand', 'Goa',
  'Sikkim', 'Meghalaya', 'Manipur', 'Mizoram', 'Nagaland', 'Tripura', 'Arunachal Pradesh', 'Delhi',
];

function toTitleCase(str = '') {
  return str
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// ── Essential fields for INITIAL GARDEN PLANNING (Change 1) ──────────────────
const INITIAL_PLANNING_REQUIRED_FIELDS = [
  {
    key: 'preferredPlants',
    label: 'which plants you would like to grow',
    check: (ctx) => Array.isArray(ctx.preferredPlants) && ctx.preferredPlants.length > 0,
  },
  {
    key: 'location.city',
    label: 'your city and state',
    check: (ctx) => Boolean(ctx.location?.city),
  },
  {
    key: 'land.area',
    label: 'roughly how much growing space you have (e.g. sq ft or pots)',
    check: (ctx) => ctx.land?.area != null,
  },
  {
    key: 'sunlightHours',
    label: 'about how many hours of direct sunlight your space gets daily',
    check: (ctx) => ctx.sunlightHours != null,
  },
  {
    key: 'season',
    label: 'which season you are planning for (e.g. winter, summer, monsoon)',
    check: (ctx) => Boolean(ctx.season) && ctx.season !== 'UNKNOWN',
  },
];

/**
 * Deterministic regex safety-net extractor to guarantee that explicit numbers,
 * seasons, plants, and city/state pairs mentioned in the user's message are
 * never dropped by a small 4B model.
 *
 * @param {string} text
 * @returns {object} Partial extractedContext
 */
function extractDeterministicSignals(text = '') {
  const out = {};
  if (!text || typeof text !== 'string') return out;
  const msg = text.trim();
  const msgLower = msg.toLowerCase();

  // 1. Land area + units (e.g. "100 sq ft", "50 sq m", "2 acres", "5 pots")
  const areaMatch = msg.match(
    /\b(\d+(?:\.\d+)?)\s*(sq\.?\s*ft\.?|square\s*feet|sq_ft|sq\.?\s*m\.?|square\s*meters?|sq_m|acres?|bighas?|cents?|containers?|pots?|grow\s*bags?)\b/i
  );
  if (areaMatch) {
    const val = parseFloat(areaMatch[1]);
    const rawUnit = areaMatch[2].toLowerCase();
    let unit = 'sq_ft';
    if (rawUnit.includes('m')) unit = 'sq_m';
    else if (rawUnit.includes('acre')) unit = 'acres';
    else if (rawUnit.includes('bigha')) unit = 'bigha';
    else if (rawUnit.includes('cent')) unit = 'cents';
    else if (rawUnit.includes('pot') || rawUnit.includes('container') || rawUnit.includes('bag')) unit = 'containers';
    out.land = { area: val, unit };
  }

  // 2. Sunlight hours (e.g. "3 hours of sunlight", "6 hours of direct sun", "6 hrs sun", "6h sunlight", or standalone "12 hours")
  const sunMatch =
    msg.match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b[^.?!]*?\b(?:sunlight|sun|light)\b/i) ||
    msg.match(/\b(?:sunlight|sun)\b[^.?!]*?\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i) ||
    msg.match(/^\s*(?:around\s+|about\s+|roughly\s+)?(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\s*(?:daily|per\s+day|a\s+day)?\s*$/i);
  if (sunMatch) {
    out.sunlightHours = parseFloat(sunMatch[1]);
  }

  // 3. Season keywords
  const seasonMatch = msgLower.match(
    /\b(winter|rabi|summer|zaid|monsoon|kharif|rainy\s+season|spring|autumn|fall|wet\s+season|dry\s+season|year[\s-]round)\b/i
  );
  if (seasonMatch) {
    out.season = normalizeSeason(seasonMatch[1]);
  }

  // 4. Location: check known cities & Indian states, or "<city> , [qualifier] <state>" pattern
  let detectedLoc = null;
  for (const [key, info] of Object.entries(KNOWN_CITY_STATE_MAP)) {
    const re = new RegExp(`\\b${key}\\b`, 'i');
    if (re.test(msgLower)) {
      detectedLoc = { ...info };
      break;
    }
  }

  const nonCityWords = new Set([
    'winter', 'summer', 'spring', 'autumn', 'fall', 'monsoon', 'rabi', 'kharif', 'zaid',
    'pots', 'pot', 'containers', 'container', 'sq', 'ft', 'feet', 'meters', 'acres',
    'hours', 'hour', 'hrs', 'sunlight', 'sun', 'direct', 'light', 'space', 'land',
    'lower', 'upper', 'north', 'south', 'east', 'west', 'central', 'grow', 'growing',
    'plant', 'planting', 'want', 'have', 'and', 'with', 'for', 'the', 'india',
  ]);

  // Check if an Indian state is explicitly mentioned, and also look for "<city> , [lower/upper/...] <state>"
  for (const st of INDIAN_STATES) {
    const escapedState = st.replace(/\s+/g, '\\s+');
    const stateRe = new RegExp(`\\b${escapedState}\\b`, 'i');
    if (stateRe.test(msg)) {
      detectedLoc = detectedLoc || { city: null, state: st, country: 'India' };
      detectedLoc.state = st;
      detectedLoc.country = 'India';

      if (!detectedLoc.city) {
        // Look for "<city> , [lower|upper|...] <State>" or "in <city> , <State>" anywhere in the message
        const beforeStateRe = new RegExp(
          `(?:^|[,;]|\\bin\\s+)\\s*([a-zA-Z]{3,22})\\s*(?:,\\s*|\\s+in\\s+)(?:(?:lower|upper|north|south|east|west|central|mid|outer|hills\\s+of)\\s+)*${escapedState}\\b`,
          'i'
        );
        const beforeMatch = msg.match(beforeStateRe);
        if (beforeMatch && !nonCityWords.has(beforeMatch[1].toLowerCase())) {
          detectedLoc.city = toTitleCase(beforeMatch[1]);
        }
      }
      break;
    }
  }

  // Check "<City>, <State>" pattern (case-insensitive)
  if (!detectedLoc?.city) {
    const cityStateComma = msg.match(/^([a-zA-Z\s]{3,25}?)\s*,\s*([a-zA-Z\s]{3,30})$/);
    if (cityStateComma) {
      const cCand = cityStateComma[1].trim();
      const sCand = cityStateComma[2].trim();
      if (!/\d/.test(cCand) && !nonCityWords.has(cCand.toLowerCase())) {
        detectedLoc = {
          city: toTitleCase(cCand),
          state: detectedLoc?.state || toTitleCase(sCand),
          country: detectedLoc?.country || 'India',
        };
      }
    }
  }

  // Check "in <City>" when not matched yet (case-insensitive, e.g. "grow hibiscus in solan in 100 sq ft")
  if (!detectedLoc?.city) {
    const inCityMatch = msg.match(/\bin\s+([a-zA-Z]{3,20})(?:\s*,\s*([a-zA-Z\s]{2,25}))?(?=\s+(?:in|with|during|this|for|and)\b|[,.?!]|$)/i);
    if (inCityMatch) {
      const candidate = inCityMatch[1].trim();
      if (!nonCityWords.has(candidate.toLowerCase())) {
        detectedLoc = {
          city: toTitleCase(candidate),
          state: inCityMatch[2] ? toTitleCase(inCityMatch[2]) : (detectedLoc?.state || null),
          country: detectedLoc?.country || null,
        };
      }
    }
  }

  if (detectedLoc) {
    out.location = detectedLoc;
  }

  // 5. Plant names after "grow <plant>" / "plant <plant>" OR known plant names in non-question messages
  const KNOWN_PLANTS_MAP = {
    tomato: 'tomato', tomatoes: 'tomato',
    hibiscus: 'hibiscus',
    rose: 'rose', roses: 'rose',
    marigold: 'marigold', marigolds: 'marigold',
    tulsi: 'tulsi', basil: 'basil',
    spinach: 'spinach', palak: 'spinach',
    coriander: 'coriander', dhania: 'coriander', cilantro: 'coriander',
    chilli: 'chilli', chillies: 'chilli', chilies: 'chilli',
    pepper: 'pepper', peppers: 'pepper', capsicum: 'capsicum',
    eggplant: 'eggplant', brinjal: 'eggplant', baingan: 'eggplant',
    okra: 'okra', bhindi: 'okra',
    mint: 'mint', pudina: 'mint',
    lemon: 'lemon', lemons: 'lemon',
    cucumber: 'cucumber', cucumbers: 'cucumber',
    carrot: 'carrot', carrots: 'carrot',
    radish: 'radish', mooli: 'radish',
    pea: 'pea', peas: 'pea', matar: 'pea',
    garlic: 'garlic',
    onion: 'onion', onions: 'onion',
    potato: 'potato', potatoes: 'potato',
    strawberry: 'strawberry', strawberries: 'strawberry',
    jasmine: 'jasmine', mogra: 'jasmine',
    bougainvillea: 'bougainvillea',
    sunflower: 'sunflower', sunflowers: 'sunflower',
    cabbage: 'cabbage', cauliflower: 'cauliflower',
    lettuce: 'lettuce', ginger: 'ginger', turmeric: 'turmeric',
  };

  const detectedPlants = new Set();
  const growMatch = msgLower.match(
    /\b(?:grow|growing|plant|planting)\s+([a-z]+(?:\s+and\s+[a-z]+)?)(?=\s+(?:in|on|at|with|during|for|this)\b|[,.?!]|$)/i
  );
  if (growMatch) {
    growMatch[1]
      .split(/\s+and\s+|,/)
      .map((s) => s.trim())
      .filter((w) => w && !['it', 'them', 'some', 'plants', 'crops', 'vegetables', 'flowers', 'garden'].includes(w))
      .forEach((w) => {
        detectedPlants.add(KNOWN_PLANTS_MAP[w] || w);
      });
  }

  // Also scan for known plants if the message is not a general question
  const isQuestionMsg = /\?$/.test(msg) || /^(what|how|why|when|where|which|who)\b/i.test(msg);
  if (!isQuestionMsg) {
    for (const [token, canonical] of Object.entries(KNOWN_PLANTS_MAP)) {
      if (new RegExp(`\\b${token}\\b`, 'i').test(msgLower)) {
        detectedPlants.add(canonical);
      }
    }
  }

  if (detectedPlants.size > 0) {
    out.preferredPlants = [...detectedPlants];
  }

  return out;
}

/**
 * Enrich a location object with inferred state/country if the city is in KNOWN_CITY_STATE_MAP.
 */
function enrichLocationState(location = {}) {
  if (!location || !location.city) return location;
  const key = location.city.trim().toLowerCase();
  const mapped = KNOWN_CITY_STATE_MAP[key];
  if (mapped) {
    return {
      city: location.city,
      state: location.state || mapped.state,
      country: location.country || mapped.country,
    };
  }
  return location;
}

/**
 * Merge extractedContext (from LLM + deterministic signals) into the existing context object.
 * Only non-null, non-undefined values from extracted are applied.
 * Arrays are merged (union), not replaced.
 * Season is normalized via normalizeSeason.
 *
 * @param {object} existing  Current gardenState.context
 * @param {object} extracted New fields from RouterDecision.extractedContext
 * @returns {object}         Merged context
 */
function mergeContext(existing = {}, extracted = {}) {
  if (!extracted || typeof extracted !== 'object') return existing;

  const merged = JSON.parse(JSON.stringify(existing));

  // Location (city, state, country)
  if (extracted.location) {
    merged.location = merged.location ?? { city: null, state: null, country: null };
    if (extracted.location.city != null) merged.location.city = extracted.location.city;
    if (extracted.location.state != null) merged.location.state = extracted.location.state;
    if (extracted.location.country != null) merged.location.country = extracted.location.country;
  }
  if (merged.location) {
    merged.location = enrichLocationState(merged.location);
  }

  // Land
  if (extracted.land) {
    merged.land = merged.land ?? { area: null, unit: 'sq_ft' };
    if (extracted.land.area != null) merged.land.area = extracted.land.area;
    if (extracted.land.unit != null) merged.land.unit = extracted.land.unit;
  }

  // Plants — union merge (no duplicates)
  if (Array.isArray(extracted.preferredPlants) && extracted.preferredPlants.length) {
    const existingPlants = new Set((merged.preferredPlants ?? []).map((p) => p.toLowerCase().trim()));
    extracted.preferredPlants.forEach((p) => {
      if (p && typeof p === 'string') existingPlants.add(p.toLowerCase().trim());
    });
    merged.preferredPlants = [...existingPlants];
  }

  // Scalars
  if (extracted.sunlightHours != null) merged.sunlightHours = extracted.sunlightHours;
  if (extracted.soilType != null) merged.soilType = extracted.soilType;
  if (extracted.waterAvailability != null) merged.waterAvailability = extracted.waterAvailability;

  // Normalized Season
  if (extracted.season != null) {
    const norm = normalizeSeason(extracted.season);
    if (norm) merged.season = norm;
  }

  return merged;
}

/**
 * Merge extracted user preferences into existing gardenState.userPreferences.
 *
 * @param {string[]} existingPrefs
 * @param {string[]} extractedPrefs
 * @returns {string[]}
 */
function mergePreferences(existingPrefs = [], extractedPrefs = []) {
  const set = new Set((existingPrefs || []).map((p) => p.trim()).filter(Boolean));
  if (Array.isArray(extractedPrefs)) {
    for (const pref of extractedPrefs) {
      if (pref && typeof pref === 'string') set.add(pref.trim());
    }
  }
  return [...set];
}

/**
 * Build a warm, human clarification question that acknowledges what we already know
 * and asks ONLY for the fields that are actually still missing.
 *
 * @param {string[]} missingKeys
 * @param {object} context
 * @returns {string}
 */
function buildClarificationForMissing(missingKeys = [], context = {}) {
  const labels = INITIAL_PLANNING_REQUIRED_FIELDS
    .filter((f) => missingKeys.includes(f.key))
    .map((f) => f.label);

  // If city is known but state could not be inferred, also ask for state so we can map climate
  if (context.location?.city && !context.location?.state && !missingKeys.includes('location.city')) {
    labels.unshift(`which state ${context.location.city} is in (for regional climate mapping)`);
  }

  if (!labels.length) {
    return 'Could you share a bit more about your garden space?';
  }

  const knownBits = [];
  if (context.preferredPlants?.length) knownBits.push(`growing ${context.preferredPlants.join(', ')}`);
  if (context.location?.city) {
    const locText = context.location.state
      ? `${context.location.city}, ${context.location.state}`
      : context.location.city;
    knownBits.push(`in ${locText}`);
  }
  if (context.land?.area != null) knownBits.push(`in your ${context.land.area} ${context.land.unit || 'sq_ft'} space`);
  if (context.sunlightHours != null) knownBits.push(`with ${context.sunlightHours}h of sunlight`);
  if (context.season && context.season !== 'UNKNOWN') knownBits.push(`for ${context.season.toLowerCase()}`);

  const prefix = knownBits.length
    ? `Got it — ${knownBits.join(' ')}! To finish tailoring your plan, could you tell me `
    : 'I would love to put together your garden plan! Could you tell me ';

  if (labels.length === 1) return `${prefix}${labels[0]}?`;
  if (labels.length === 2) return `${prefix}${labels[0]} and ${labels[1]}?`;
  const last = labels[labels.length - 1];
  const rest = labels.slice(0, -1).join(', ');
  return `${prefix}${rest}, and ${last}?`;
}

/**
 * Evaluate which of the 5 initial-planning required fields are missing from context.
 *
 * @param {object} context
 * @returns {{ missing: string[], isComplete: boolean }}
 */
function evaluateCompleteness(context = {}) {
  const missing = INITIAL_PLANNING_REQUIRED_FIELDS
    .filter((f) => !f.check(context))
    .map((f) => f.key);

  return { missing, isComplete: missing.length === 0 };
}

/**
 * Intent-dependent context completeness evaluation (Change 1).
 */
function evaluateIntentCompleteness(context = {}, intent = 'CREATE_GARDEN_PLAN', userMessage = '', hasExistingPlan = false) {
  const msgLower = (userMessage || '').toLowerCase();

  // 1. Initial Garden Planning requires all 5 essential fields (including season)
  if (intent === 'CREATE_GARDEN_PLAN' || (intent === 'PROVIDE_CONTEXT' && !hasExistingPlan)) {
    return evaluateCompleteness(context);
  }

  // 2. Out-of-scope / non-gardening queries require no garden context and are rejected immediately
  if (intent === 'OUT_OF_SCOPE') {
    return { missing: [], isComplete: true };
  }

  // 3. General science / concept / greeting questions require no garden context
  if (intent === 'GENERAL_CHAT') {
    return { missing: [], isComplete: true };
  }

  // 4. Task updates require no additional context
  if (intent === 'TASK_UPDATE') {
    return { missing: [], isComplete: true };
  }

  // 5. Plant health / symptom observation does not require land.area or sunlightHours
  if (intent === 'REPORT_OBSERVATION') {
    return { missing: [], isComplete: true };
  }

  // 6. ASK_QUESTION: check if the question explicitly asks for regional/seasonal crop advice
  if (intent === 'ASK_QUESTION') {
    const asksWhatToPlantHere =
      /\b(what should i plant|what can i grow|which crops can i grow|best plants for my)\b/i.test(msgLower);
    if (asksWhatToPlantHere) {
      const missingForSuitability = [];
      if (!context.location?.city) missingForSuitability.push('location.city');
      if (!context.season || context.season === 'UNKNOWN') missingForSuitability.push('season');
      if (context.location?.city) {
        return { missing: [], isComplete: true };
      }
      return {
        missing: missingForSuitability,
        isComplete: missingForSuitability.length === 0,
      };
    }

    return { missing: [], isComplete: true };
  }

  return evaluateCompleteness(context);
}

/**
 * Deterministic check for clearly non-gardening / off-topic queries as a safety net
 * for small models so out-of-scope inputs are always rejected at the Query Rewriter phase.
 *
 * @param {string} userMessage
 * @returns {boolean}
 */
function isOutOfScopeMessage(userMessage = '') {
  if (!userMessage || typeof userMessage !== 'string') return false;
  const msg = userMessage.trim().toLowerCase();

  // Never flag messages that mention gardening, plants, soil, water, sunlight, climate, or plan terms
  const hasGardeningSignal =
    /\b(plant|plants|garden|gardening|grow|growing|seed|soil|water|watering|sunlight|sun|fertilizer|compost|mulch|prune|pruning|pest|disease|leaf|leaves|root|stem|flower|fruit|vegetable|crop|harvest|pot|container|sq\s*ft|acre|season|winter|summer|monsoon|spring|autumn|frost|photosynthesis|germination|hibiscus|tomato|potato|chilli|rose|spinach|carrot|onion|cucumber)\b/i.test(
      msg
    );
  if (hasGardeningSignal) return false;

  // Detect clear non-gardening domains (coding, sports, cooking recipes, politics, movies, finance, math homework)
  const offTopicPattern =
    /\b(python|javascript|java|c\+\+|html|css|binary\s+search|algorithm|leetcode|write\s+code|write\s+a\s+program|cricket|football|soccer|ipl|world\s+cup|who\s+won\s+the\s+match|recipe\s+for|how\s+to\s+cook|pasta|biryani|pizza|movie|actor|netflix|bitcoin|crypto|stock\s+market|prime\s+minister|president|election|solve\s+this\s+equation|integral\s+of|derivative\s+of)\b/i;

  return offTopicPattern.test(msg);
}

/**
 * Build a polite, specific refusal message when an input is rejected at the Query Rewriter phase.
 *
 * @param {object} existingContext
 * @returns {string}
 */
function buildOutOfScopeRefusal(existingContext = {}) {
  const plants = existingContext.preferredPlants?.length
    ? existingContext.preferredPlants.join(', ')
    : null;
  const city = existingContext.location?.city || null;

  if (plants && city) {
    return `I'm AI Gardener, so I can only help with gardening, plant care, and your active ${plants} garden plan in ${city}. Feel free to ask me about your next garden task, watering, soil, or plant health!`;
  }
  if (plants) {
    return `I'm AI Gardener, so I can only help with gardening, plant care, and your ${plants} plan—not unrelated topics. Ask me anything about growing or caring for your plants!`;
  }
  return `I'm AI Gardener, so I only answer questions related to gardening, plant health, and building your garden plan. Tell me what plants you'd like to grow and your city/state to get started!`;
}

/**
 * Synchronize routing flags (`requiredKnowledgeSources`, `requiredTools`,
 * `needsKnowledge`, `needsClimateKnowledge`, `needsSessionContext`, `climateQuery`)
 * so that all downstream services receive consistent routing metadata.
 */
function normalizeRoutingDecision(decision, updatedContext, userMessage) {
  if (decision.intent === 'OUT_OF_SCOPE') {
    decision.status = 'READY';
    decision.requiredKnowledgeSources = [];
    decision.requiredTools = [];
    decision.needsKnowledge = false;
    decision.knowledgeQuery = null;
    decision.needsClimateKnowledge = false;
    decision.climateQuery = null;
    decision.needsSessionContext = false;
    decision.needsPhotoAnalysis = false;
    decision.needsPlanner = false;
    decision.clarificationQuestion = null;
    return decision;
  }

  const sources = new Set(decision.requiredKnowledgeSources ?? []);
  const tools = new Set(decision.requiredTools ?? []);
  const msgLower = (userMessage || '').toLowerCase();

  const isSessionRecall =
    /\b(yesterday|earlier|previous|remember|what did i tell|what am i growing|my current plan)\b/i.test(msgLower);

  if (isSessionRecall) {
    sources.add('SESSION_CONTEXT');
    decision.needsSessionContext = true;
  }

  if (decision.needsKnowledge || decision.knowledgeQuery) {
    sources.add('PLANT_HEALTH');
    decision.needsKnowledge = true;
  }

  const mentionsLocationOrSeason =
    Boolean(updatedContext.location?.city || updatedContext.location?.state) &&
    (decision.intent === 'CREATE_GARDEN_PLAN' ||
      decision.intent === 'PROVIDE_CONTEXT' ||
      /\b(winter|summer|monsoon|spring|autumn|fall|rabi|kharif|zaid|climate|weather|season|frost|heat|rain|humid|plant in|grow in)\b/i.test(msgLower));

  if (decision.needsClimateKnowledge || decision.climateQuery || sources.has('CLIMATE_LOCATION') || mentionsLocationOrSeason) {
    if (decision.status === 'READY' && (updatedContext.location?.city || updatedContext.location?.state || decision.climateQuery?.locationName)) {
      sources.add('CLIMATE_LOCATION');
      decision.needsClimateKnowledge = true;

      const locName = decision.climateQuery?.locationName || updatedContext.location?.city || null;
      const stateProv = decision.climateQuery?.stateProvince || updatedContext.location?.state || null;
      const country = decision.climateQuery?.country || updatedContext.location?.country || null;
      const season = normalizeSeason(decision.climateQuery?.normalizedSeason || updatedContext.season);

      decision.climateQuery = {
        semanticQuery:
          decision.climateQuery?.semanticQuery ||
          [locName, stateProv, country, season, userMessage].filter(Boolean).join(' '),
        locationName: locName,
        stateProvince: stateProv,
        country,
        region: decision.climateQuery?.region || null,
        subregion: decision.climateQuery?.subregion || null,
        normalizedSeason: season,
        knowledgeTypes: decision.climateQuery?.knowledgeTypes?.length
          ? decision.climateQuery.knowledgeTypes
          : ['LOCATION_MAPPING', 'REGIONAL_CLIMATE', 'SEASONAL_CONTEXT'],
      };
    }
  }

  if (decision.needsPlanner) tools.add('PLANNER');
  if (decision.needsPhotoAnalysis) tools.add('PHOTO_READER');

  decision.requiredKnowledgeSources = [...sources];
  decision.requiredTools = [...tools];
  if (!decision.normalizedQuery) {
    decision.normalizedQuery = userMessage.trim();
  }

  return decision;
}

/**
 * Run the Query Rewriter.
 *
 * Takes the current session and the user's new message.
 * Combines Gemma 3 structured extraction with deterministic signal extraction so
 * user-provided context is never missed or re-asked.
 *
 * @param {object} session      Full session document from MongoDB
 * @param {string} userMessage
 * @returns {Promise<{ decision: object, updatedContext: object, updatedPreferences: string[] }>}
 */
async function runQueryRewriter(session, userMessage) {
  const existingContext = session.gardenState?.context ?? {};
  const existingPreferences = session.gardenState?.userPreferences ?? [];
  const hasExistingPlan = Boolean(session.gardenState?.currentPlan?.summary);

  // ── FAST-PATH 1 (0 LLM Calls): Out-of-scope / non-gardening rejection ────────
  if (isOutOfScopeMessage(userMessage)) {
    logger.info('[QueryRewriter] Fast-path (0 LLM calls): Rejecting out-of-scope query.');
    const decision = RouterDecisionSchema.parse({
      status: 'READY',
      intent: 'OUT_OF_SCOPE',
      normalizedQuery: userMessage.trim(),
      extractedContext: {},
      missingRequiredContext: [],
      requiredKnowledgeSources: [],
      requiredTools: [],
      needsKnowledge: false,
      knowledgeQuery: null,
      needsClimateKnowledge: false,
      climateQuery: null,
      needsSessionContext: false,
      needsPhotoAnalysis: false,
      needsPlanner: false,
      clarificationQuestion: null,
      directAnswer: buildOutOfScopeRefusal(existingContext),
    });
    return {
      decision,
      updatedContext: existingContext,
      updatedPreferences: existingPreferences,
    };
  }

  // Extract deterministic context signals to combine with LLM output
  const deterministicSignals = extractDeterministicSignals(userMessage);

  const userPrompt = buildUserPrompt(session, userMessage);

  logger.debug('[QueryRewriter] calling Gemma...');
  let decision;
  try {
    decision = await ai.generateStructuredOutput(
      SYSTEM_PROMPT,
      userPrompt,
      RouterDecisionSchema
    );
    logger.debug('[QueryRewriter] raw decision:', JSON.stringify(decision, null, 2));
  } catch (err) {
    logger.warn(`[QueryRewriter] Local LLM unreachable (${err.message}) — using deterministic router fallback.`);
    const isQuestion = /\?|\b(how|what|when|why|which|can i|should i)\b/i.test(userMessage);
    const fallbackIntent = hasExistingPlan
      ? isQuestion
        ? 'ASK_QUESTION'
        : 'UPDATE_PLAN'
      : isQuestion && Object.keys(deterministicSignals).length === 0
        ? 'ASK_QUESTION'
        : 'CREATE_GARDEN_PLAN';
    const primaryPlant =
      deterministicSignals.preferredPlants?.[0] || existingContext.preferredPlants?.[0] || null;
    decision = RouterDecisionSchema.parse({
      status: 'READY',
      intent: fallbackIntent,
      normalizedQuery: userMessage.trim(),
      extractedContext: deterministicSignals,
      missingRequiredContext: [],
      requiredKnowledgeSources: ['PLANT_HEALTH', 'CLIMATE_LOCATION'],
      requiredTools: fallbackIntent === 'ASK_QUESTION' ? [] : ['PLANNER'],
      needsKnowledge: true,
      knowledgeQuery: {
        semanticQuery: `${primaryPlant || ''} ${userMessage}`.trim(),
        knowledgeTypes: ['HEALTHY_BASELINE', 'GROWTH_STAGE', 'MAINTENANCE', 'PREVENTION'],
        plantFilter: primaryPlant,
      },
      needsClimateKnowledge: Boolean(
        deterministicSignals.location?.city || existingContext.location?.city
      ),
      climateQuery: null,
      needsSessionContext: false,
      needsPhotoAnalysis: false,
      needsPlanner: fallbackIntent !== 'ASK_QUESTION',
      clarificationQuestion: null,
      directAnswer: null,
    });
  }

  // Post-LLM out-of-scope guardrail (if LLM classified a borderline query as OUT_OF_SCOPE)
  if (decision.intent === 'OUT_OF_SCOPE') {
    logger.info('[QueryRewriter] Rejecting LLM-classified out-of-scope query at Query Rewriter phase.');
    decision.status = 'READY';
    decision.intent = 'OUT_OF_SCOPE';
    decision.extractedContext = {};
    decision.missingRequiredContext = [];
    decision.requiredKnowledgeSources = [];
    decision.requiredTools = [];
    decision.needsKnowledge = false;
    decision.knowledgeQuery = null;
    decision.needsClimateKnowledge = false;
    decision.climateQuery = null;
    decision.needsSessionContext = false;
    decision.needsPhotoAnalysis = false;
    decision.needsPlanner = false;
    decision.clarificationQuestion = null;
    if (!decision.directAnswer || !decision.directAnswer.trim()) {
      decision.directAnswer = buildOutOfScopeRefusal(existingContext);
    }
    return {
      decision,
      updatedContext: existingContext,
      updatedPreferences: existingPreferences,
    };
  }

  // Combine existing context + LLM extractedContext + deterministic regex signals
  const afterLLM = mergeContext(existingContext, decision.extractedContext ?? {});
  const updatedContext = mergeContext(afterLLM, deterministicSignals);

  const updatedPreferences = mergePreferences(
    existingPreferences,
    decision.extractedContext?.userPreferences ?? []
  );

  const { missing, isComplete } = evaluateIntentCompleteness(
    updatedContext,
    decision.intent,
    userMessage,
    hasExistingPlan
  );

  if (isComplete) {
    if (decision.status === 'NEEDS_CONTEXT') {
      logger.info('[QueryRewriter] All intent-required fields present — overriding status to READY.');
    }
    decision.status = 'READY';
    decision.missingRequiredContext = [];
    decision.clarificationQuestion = null;

    if (decision.intent === 'CREATE_GARDEN_PLAN' || (decision.intent === 'PROVIDE_CONTEXT' && !hasExistingPlan)) {
      decision.needsPlanner = true;
      decision.needsKnowledge = true;
      if (!decision.knowledgeQuery) {
        const primaryPlant = updatedContext.preferredPlants?.[0] || null;
        decision.knowledgeQuery = {
          semanticQuery: `${primaryPlant || 'garden'} planting soil water sunlight ${updatedContext.season || ''}`.trim(),
          knowledgeTypes: ['PLANT_BASIC', 'PLANTING', 'SOIL', 'WATER', 'SUNLIGHT', 'CLIMATE'],
          plantFilter: primaryPlant,
        };
      }
    }
  } else {
    decision.status = 'NEEDS_CONTEXT';
    decision.missingRequiredContext = missing;
    decision.needsPlanner = false;
    // Always rebuild clarification if LLM's question mentions fields that are ALREADY known!
    const llmQuestion = (decision.clarificationQuestion || '').toLowerCase();
    const mentionsKnownCity = updatedContext.location?.city && /\b(city|location|where)\b/.test(llmQuestion);
    const mentionsKnownArea = updatedContext.land?.area != null && /\b(space|area|size|how much land|sq ft)\b/.test(llmQuestion);
    const mentionsKnownSun = updatedContext.sunlightHours != null && /\b(sunlight|hours of sun)\b/.test(llmQuestion);
    const mentionsKnownSeason = updatedContext.season && /\b(season)\b/.test(llmQuestion);

    if (!decision.clarificationQuestion || mentionsKnownCity || mentionsKnownArea || mentionsKnownSun || mentionsKnownSeason) {
      decision.clarificationQuestion = buildClarificationForMissing(missing, updatedContext);
    }
  }

  normalizeRoutingDecision(decision, updatedContext, userMessage);

  return { decision, updatedContext, updatedPreferences };
}

module.exports = {
  INITIAL_PLANNING_REQUIRED_FIELDS,
  KNOWN_CITY_STATE_MAP,
  extractDeterministicSignals,
  isOutOfScopeMessage,
  buildOutOfScopeRefusal,
  runQueryRewriter,
  mergeContext,
  mergePreferences,
  evaluateCompleteness,
  evaluateIntentCompleteness,
  buildClarificationForMissing,
  normalizeRoutingDecision,
};
