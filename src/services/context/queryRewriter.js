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
  allahabad: { city: 'Prayagraj', state: 'Uttar Pradesh', country: 'India' },
  agra: { city: 'Agra', state: 'Uttar Pradesh', country: 'India' },
  noida: { city: 'Noida', state: 'Uttar Pradesh', country: 'India' },
  ghaziabad: { city: 'Ghaziabad', state: 'Uttar Pradesh', country: 'India' },
  meerut: { city: 'Meerut', state: 'Uttar Pradesh', country: 'India' },
  bareilly: { city: 'Bareilly', state: 'Uttar Pradesh', country: 'India' },
  aligarh: { city: 'Aligarh', state: 'Uttar Pradesh', country: 'India' },
  moradabad: { city: 'Moradabad', state: 'Uttar Pradesh', country: 'India' },
  saharanpur: { city: 'Saharanpur', state: 'Uttar Pradesh', country: 'India' },
  jhansi: { city: 'Jhansi', state: 'Uttar Pradesh', country: 'India' },
  mathura: { city: 'Mathura', state: 'Uttar Pradesh', country: 'India' },
  ayodhya: { city: 'Ayodhya', state: 'Uttar Pradesh', country: 'India' },
  kushinagar: { city: 'Kushinagar', state: 'Uttar Pradesh', country: 'India' },
  deoria: { city: 'Deoria', state: 'Uttar Pradesh', country: 'India' },
  basti: { city: 'Basti', state: 'Uttar Pradesh', country: 'India' },
  azamgarh: { city: 'Azamgarh', state: 'Uttar Pradesh', country: 'India' },
  jaunpur: { city: 'Jaunpur', state: 'Uttar Pradesh', country: 'India' },
  mirzapur: { city: 'Mirzapur', state: 'Uttar Pradesh', country: 'India' },
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
  kinnaur: { city: 'Kinnaur', state: 'Himachal Pradesh', country: 'India' },
  spiti: { city: 'Spiti', state: 'Himachal Pradesh', country: 'India' },
  dehradun: { city: 'Dehradun', state: 'Uttarakhand', country: 'India' },
  nainital: { city: 'Nainital', state: 'Uttarakhand', country: 'India' },
  haridwar: { city: 'Haridwar', state: 'Uttarakhand', country: 'India' },
  rishikesh: { city: 'Rishikesh', state: 'Uttarakhand', country: 'India' },
  roorkee: { city: 'Roorkee', state: 'Uttarakhand', country: 'India' },
  haldwani: { city: 'Haldwani', state: 'Uttarakhand', country: 'India' },
  mussoorie: { city: 'Mussoorie', state: 'Uttarakhand', country: 'India' },
  almora: { city: 'Almora', state: 'Uttarakhand', country: 'India' },
  srinagar: { city: 'Srinagar', state: 'Jammu and Kashmir', country: 'India' },
  jammu: { city: 'Jammu', state: 'Jammu and Kashmir', country: 'India' },
  leh: { city: 'Leh', state: 'Jammu and Kashmir', country: 'India' },
  pune: { city: 'Pune', state: 'Maharashtra', country: 'India' },
  mumbai: { city: 'Mumbai', state: 'Maharashtra', country: 'India' },
  thane: { city: 'Thane', state: 'Maharashtra', country: 'India' },
  nagpur: { city: 'Nagpur', state: 'Maharashtra', country: 'India' },
  nashik: { city: 'Nashik', state: 'Maharashtra', country: 'India' },
  aurangabad: { city: 'Aurangabad', state: 'Maharashtra', country: 'India' },
  kolhapur: { city: 'Kolhapur', state: 'Maharashtra', country: 'India' },
  solapur: { city: 'Solapur', state: 'Maharashtra', country: 'India' },
  amravati: { city: 'Amravati', state: 'Maharashtra', country: 'India' },
  satara: { city: 'Satara', state: 'Maharashtra', country: 'India' },
  sangli: { city: 'Sangli', state: 'Maharashtra', country: 'India' },
  ratnagiri: { city: 'Ratnagiri', state: 'Maharashtra', country: 'India' },
  bengaluru: { city: 'Bengaluru', state: 'Karnataka', country: 'India' },
  bangalore: { city: 'Bengaluru', state: 'Karnataka', country: 'India' },
  mysuru: { city: 'Mysuru', state: 'Karnataka', country: 'India' },
  mysore: { city: 'Mysuru', state: 'Karnataka', country: 'India' },
  mangaluru: { city: 'Mangaluru', state: 'Karnataka', country: 'India' },
  mangalore: { city: 'Mangaluru', state: 'Karnataka', country: 'India' },
  hubli: { city: 'Hubli', state: 'Karnataka', country: 'India' },
  dharwad: { city: 'Dharwad', state: 'Karnataka', country: 'India' },
  belagavi: { city: 'Belagavi', state: 'Karnataka', country: 'India' },
  belgaum: { city: 'Belagavi', state: 'Karnataka', country: 'India' },
  shivamogga: { city: 'Shivamogga', state: 'Karnataka', country: 'India' },
  tumakuru: { city: 'Tumakuru', state: 'Karnataka', country: 'India' },
  tumkur: { city: 'Tumakuru', state: 'Karnataka', country: 'India' },
  udupi: { city: 'Udupi', state: 'Karnataka', country: 'India' },
  coorg: { city: 'Coorg', state: 'Karnataka', country: 'India' },
  kodagu: { city: 'Kodagu', state: 'Karnataka', country: 'India' },
  jodhpur: { city: 'Jodhpur', state: 'Rajasthan', country: 'India' },
  jaipur: { city: 'Jaipur', state: 'Rajasthan', country: 'India' },
  udaipur: { city: 'Udaipur', state: 'Rajasthan', country: 'India' },
  bikaner: { city: 'Bikaner', state: 'Rajasthan', country: 'India' },
  kota: { city: 'Kota', state: 'Rajasthan', country: 'India' },
  ajmer: { city: 'Ajmer', state: 'Rajasthan', country: 'India' },
  alwar: { city: 'Alwar', state: 'Rajasthan', country: 'India' },
  bharatpur: { city: 'Bharatpur', state: 'Rajasthan', country: 'India' },
  sikar: { city: 'Sikar', state: 'Rajasthan', country: 'India' },
  jaisalmer: { city: 'Jaisalmer', state: 'Rajasthan', country: 'India' },
  barmer: { city: 'Barmer', state: 'Rajasthan', country: 'India' },
  bhilwara: { city: 'Bhilwara', state: 'Rajasthan', country: 'India' },
  chennai: { city: 'Chennai', state: 'Tamil Nadu', country: 'India' },
  kancheepuram: { city: 'Kancheepuram', state: 'Tamil Nadu', country: 'India' },
  kanchipuram: { city: 'Kancheepuram', state: 'Tamil Nadu', country: 'India' },
  coimbatore: { city: 'Coimbatore', state: 'Tamil Nadu', country: 'India' },
  madurai: { city: 'Madurai', state: 'Tamil Nadu', country: 'India' },
  salem: { city: 'Salem', state: 'Tamil Nadu', country: 'India' },
  trichy: { city: 'Tiruchirappalli', state: 'Tamil Nadu', country: 'India' },
  tiruchirappalli: { city: 'Tiruchirappalli', state: 'Tamil Nadu', country: 'India' },
  tirunelveli: { city: 'Tirunelveli', state: 'Tamil Nadu', country: 'India' },
  vellore: { city: 'Vellore', state: 'Tamil Nadu', country: 'India' },
  erode: { city: 'Erode', state: 'Tamil Nadu', country: 'India' },
  thanjavur: { city: 'Thanjavur', state: 'Tamil Nadu', country: 'India' },
  ooty: { city: 'Ooty', state: 'Tamil Nadu', country: 'India' },
  kodaikanal: { city: 'Kodaikanal', state: 'Tamil Nadu', country: 'India' },
  puducherry: { city: 'Puducherry', state: 'Tamil Nadu', country: 'India' },
  pondicherry: { city: 'Puducherry', state: 'Tamil Nadu', country: 'India' },
  guwahati: { city: 'Guwahati', state: 'Assam', country: 'India' },
  kamrup: { city: 'Kamrup', state: 'Assam', country: 'India' },
  dibrugarh: { city: 'Dibrugarh', state: 'Assam', country: 'India' },
  silchar: { city: 'Silchar', state: 'Assam', country: 'India' },
  jorhat: { city: 'Jorhat', state: 'Assam', country: 'India' },
  tezpur: { city: 'Tezpur', state: 'Assam', country: 'India' },
  patna: { city: 'Patna', state: 'Bihar', country: 'India' },
  gaya: { city: 'Gaya', state: 'Bihar', country: 'India' },
  muzaffarpur: { city: 'Muzaffarpur', state: 'Bihar', country: 'India' },
  bhagalpur: { city: 'Bhagalpur', state: 'Bihar', country: 'India' },
  darbhanga: { city: 'Darbhanga', state: 'Bihar', country: 'India' },
  nalanda: { city: 'Nalanda', state: 'Bihar', country: 'India' },
  purnia: { city: 'Purnia', state: 'Bihar', country: 'India' },
  kolkata: { city: 'Kolkata', state: 'West Bengal', country: 'India' },
  calcutta: { city: 'Kolkata', state: 'West Bengal', country: 'India' },
  howrah: { city: 'Howrah', state: 'West Bengal', country: 'India' },
  darjeeling: { city: 'Darjeeling', state: 'West Bengal', country: 'India' },
  siliguri: { city: 'Siliguri', state: 'West Bengal', country: 'India' },
  durgapur: { city: 'Durgapur', state: 'West Bengal', country: 'India' },
  asansol: { city: 'Asansol', state: 'West Bengal', country: 'India' },
  kharagpur: { city: 'Kharagpur', state: 'West Bengal', country: 'India' },
  delhi: { city: 'Delhi', state: 'Delhi', country: 'India' },
  gurgaon: { city: 'Gurgaon', state: 'Haryana', country: 'India' },
  gurugram: { city: 'Gurugram', state: 'Haryana', country: 'India' },
  faridabad: { city: 'Faridabad', state: 'Haryana', country: 'India' },
  rohtak: { city: 'Rohtak', state: 'Haryana', country: 'India' },
  panipat: { city: 'Panipat', state: 'Haryana', country: 'India' },
  karnal: { city: 'Karnal', state: 'Haryana', country: 'India' },
  ambala: { city: 'Ambala', state: 'Haryana', country: 'India' },
  hisar: { city: 'Hisar', state: 'Haryana', country: 'India' },
  sonipat: { city: 'Sonipat', state: 'Haryana', country: 'India' },
  kurukshetra: { city: 'Kurukshetra', state: 'Haryana', country: 'India' },
  panchkula: { city: 'Panchkula', state: 'Haryana', country: 'India' },
  chandigarh: { city: 'Chandigarh', state: 'Punjab', country: 'India' },
  ludhiana: { city: 'Ludhiana', state: 'Punjab', country: 'India' },
  amritsar: { city: 'Amritsar', state: 'Punjab', country: 'India' },
  jalandhar: { city: 'Jalandhar', state: 'Punjab', country: 'India' },
  patiala: { city: 'Patiala', state: 'Punjab', country: 'India' },
  bathinda: { city: 'Bathinda', state: 'Punjab', country: 'India' },
  mohali: { city: 'Mohali', state: 'Punjab', country: 'India' },
  pathankot: { city: 'Pathankot', state: 'Punjab', country: 'India' },
  hoshiarpur: { city: 'Hoshiarpur', state: 'Punjab', country: 'India' },
  bhopal: { city: 'Bhopal', state: 'Madhya Pradesh', country: 'India' },
  indore: { city: 'Indore', state: 'Madhya Pradesh', country: 'India' },
  gwalior: { city: 'Gwalior', state: 'Madhya Pradesh', country: 'India' },
  jabalpur: { city: 'Jabalpur', state: 'Madhya Pradesh', country: 'India' },
  ujjain: { city: 'Ujjain', state: 'Madhya Pradesh', country: 'India' },
  sagar: { city: 'Sagar', state: 'Madhya Pradesh', country: 'India' },
  rewa: { city: 'Rewa', state: 'Madhya Pradesh', country: 'India' },
  satna: { city: 'Satna', state: 'Madhya Pradesh', country: 'India' },
  ahmedabad: { city: 'Ahmedabad', state: 'Gujarat', country: 'India' },
  surat: { city: 'Surat', state: 'Gujarat', country: 'India' },
  vadodara: { city: 'Vadodara', state: 'Gujarat', country: 'India' },
  baroda: { city: 'Vadodara', state: 'Gujarat', country: 'India' },
  rajkot: { city: 'Rajkot', state: 'Gujarat', country: 'India' },
  gandhinagar: { city: 'Gandhinagar', state: 'Gujarat', country: 'India' },
  bhavnagar: { city: 'Bhavnagar', state: 'Gujarat', country: 'India' },
  jamnagar: { city: 'Jamnagar', state: 'Gujarat', country: 'India' },
  junagadh: { city: 'Junagadh', state: 'Gujarat', country: 'India' },
  anand: { city: 'Anand', state: 'Gujarat', country: 'India' },
  bhuj: { city: 'Bhuj', state: 'Gujarat', country: 'India' },
  hyderabad: { city: 'Hyderabad', state: 'Telangana', country: 'India' },
  warangal: { city: 'Warangal', state: 'Telangana', country: 'India' },
  nizamabad: { city: 'Nizamabad', state: 'Telangana', country: 'India' },
  karimnagar: { city: 'Karimnagar', state: 'Telangana', country: 'India' },
  visakhapatnam: { city: 'Visakhapatnam', state: 'Andhra Pradesh', country: 'India' },
  vizag: { city: 'Visakhapatnam', state: 'Andhra Pradesh', country: 'India' },
  vijayawada: { city: 'Vijayawada', state: 'Andhra Pradesh', country: 'India' },
  guntur: { city: 'Guntur', state: 'Andhra Pradesh', country: 'India' },
  nellore: { city: 'Nellore', state: 'Andhra Pradesh', country: 'India' },
  kurnool: { city: 'Kurnool', state: 'Andhra Pradesh', country: 'India' },
  tirupati: { city: 'Tirupati', state: 'Andhra Pradesh', country: 'India' },
  rajahmundry: { city: 'Rajahmundry', state: 'Andhra Pradesh', country: 'India' },
  kochi: { city: 'Kochi', state: 'Kerala', country: 'India' },
  ernakulam: { city: 'Ernakulam', state: 'Kerala', country: 'India' },
  thiruvananthapuram: { city: 'Thiruvananthapuram', state: 'Kerala', country: 'India' },
  trivandrum: { city: 'Thiruvananthapuram', state: 'Kerala', country: 'India' },
  kozhikode: { city: 'Kozhikode', state: 'Kerala', country: 'India' },
  calicut: { city: 'Kozhikode', state: 'Kerala', country: 'India' },
  kollam: { city: 'Kollam', state: 'Kerala', country: 'India' },
  wayanad: { city: 'Wayanad', state: 'Kerala', country: 'India' },
  thrissur: { city: 'Thrissur', state: 'Kerala', country: 'India' },
  palakkad: { city: 'Palakkad', state: 'Kerala', country: 'India' },
  alappuzha: { city: 'Alappuzha', state: 'Kerala', country: 'India' },
  kannur: { city: 'Kannur', state: 'Kerala', country: 'India' },
  kottayam: { city: 'Kottayam', state: 'Kerala', country: 'India' },
  malappuram: { city: 'Malappuram', state: 'Kerala', country: 'India' },
  idukki: { city: 'Idukki', state: 'Kerala', country: 'India' },
  munnar: { city: 'Munnar', state: 'Kerala', country: 'India' },
  bhubaneswar: { city: 'Bhubaneswar', state: 'Odisha', country: 'India' },
  khordha: { city: 'Khordha', state: 'Odisha', country: 'India' },
  khurda: { city: 'Khordha', state: 'Odisha', country: 'India' },
  cuttack: { city: 'Cuttack', state: 'Odisha', country: 'India' },
  puri: { city: 'Puri', state: 'Odisha', country: 'India' },
  rourkela: { city: 'Rourkela', state: 'Odisha', country: 'India' },
  sambalpur: { city: 'Sambalpur', state: 'Odisha', country: 'India' },
  raipur: { city: 'Raipur', state: 'Chhattisgarh', country: 'India' },
  bhilai: { city: 'Bhilai', state: 'Chhattisgarh', country: 'India' },
  durg: { city: 'Durg', state: 'Chhattisgarh', country: 'India' },
  ranchi: { city: 'Ranchi', state: 'Jharkhand', country: 'India' },
  jamshedpur: { city: 'Jamshedpur', state: 'Jharkhand', country: 'India' },
  dhanbad: { city: 'Dhanbad', state: 'Jharkhand', country: 'India' },
  bokaro: { city: 'Bokaro', state: 'Jharkhand', country: 'India' },
  deoghar: { city: 'Deoghar', state: 'Jharkhand', country: 'India' },
  panaji: { city: 'Panaji', state: 'Goa', country: 'India' },
  margao: { city: 'Margao', state: 'Goa', country: 'India' },
  goa: { city: 'Goa', state: 'Goa', country: 'India' },
  gangtok: { city: 'Gangtok', state: 'Sikkim', country: 'India' },
  shillong: { city: 'Shillong', state: 'Meghalaya', country: 'India' },
  imphal: { city: 'Imphal', state: 'Manipur', country: 'India' },
  aizawl: { city: 'Aizawl', state: 'Mizoram', country: 'India' },
  kohima: { city: 'Kohima', state: 'Nagaland', country: 'India' },
  dimapur: { city: 'Dimapur', state: 'Nagaland', country: 'India' },
  agartala: { city: 'Agartala', state: 'Tripura', country: 'India' },
  itanagar: { city: 'Itanagar', state: 'Arunachal Pradesh', country: 'India' },
  fresno: { city: 'Fresno', state: 'California', country: 'United States' },
  phoenix: { city: 'Phoenix', state: 'Arizona', country: 'United States' },
  miami: { city: 'Miami', state: 'Florida', country: 'United States' },
  chicago: { city: 'Chicago', state: 'Illinois', country: 'United States' },
  seattle: { city: 'Seattle', state: 'Washington', country: 'United States' },
  ithaca: { city: 'Ithaca', state: 'New York', country: 'United States' },
  nairobi: { city: 'Nairobi', state: 'Nairobi County', country: 'Kenya' },
  cairo: { city: 'Cairo', state: 'Cairo Governorate', country: 'Egypt' },
  singapore: { city: 'Singapore', state: 'Singapore', country: 'Singapore' },
  london: { city: 'London', state: 'England', country: 'United Kingdom' },
  sydney: { city: 'Sydney', state: 'New South Wales', country: 'Australia' },
  melbourne: { city: 'Melbourne', state: 'Victoria', country: 'Australia' },
};

const INDIAN_STATES = [
  'Himachal Pradesh', 'Uttar Pradesh', 'Maharashtra', 'Karnataka', 'Rajasthan',
  'Tamil Nadu', 'Assam', 'Bihar', 'West Bengal', 'Punjab', 'Haryana',
  'Uttarakhand', 'Jammu and Kashmir', 'Madhya Pradesh', 'Gujarat', 'Telangana',
  'Andhra Pradesh', 'Kerala', 'Odisha', 'Chhattisgarh', 'Jharkhand', 'Goa',
  'Sikkim', 'Meghalaya', 'Manipur', 'Mizoram', 'Nagaland', 'Tripura', 'Arunachal Pradesh', 'Delhi',
];

const INDIAN_STATES_LOWER_SET = new Set(INDIAN_STATES.map((s) => s.toLowerCase()));

// ── Supported Plants Map (76 CSV crops + common Indian garden/ornamental plants) ──
const KNOWN_PLANTS_MAP = {
  amaranth: 'amaranth', chaulai: 'amaranth',
  apple: 'apple', apples: 'apple',
  artichoke: 'artichoke', artichokes: 'artichoke',
  asparagus: 'asparagus',
  avocado: 'avocado', avocados: 'avocado',
  banana: 'banana', bananas: 'banana', kela: 'banana',
  basil: 'basil', tulsi: 'tulsi',
  bean: 'beans', beans: 'beans', rajma: 'beans', lobia: 'beans', sem: 'beans',
  beet: 'beet', beets: 'beet', beetroot: 'beet', chukandar: 'beet',
  'bitter gourd': 'bitter gourd', karela: 'bitter gourd',
  blackberry: 'blackberry', blackberries: 'blackberry',
  blueberry: 'blueberry', blueberries: 'blueberry',
  'bok choy': 'bok choy', pakchoi: 'bok choy',
  'bottle gourd': 'bottle gourd', lauki: 'bottle gourd', ghiya: 'bottle gourd',
  broccoli: 'broccoli',
  'brussels sprouts': 'brussels sprouts',
  cabbage: 'cabbage', cabbages: 'cabbage', 'patta gobi': 'cabbage',
  carrot: 'carrot', carrots: 'carrot', gajar: 'carrot',
  cauliflower: 'cauliflower', cauliflowers: 'cauliflower', gobi: 'cauliflower', 'phool gobi': 'cauliflower',
  celery: 'celery',
  cherry: 'cherry', cherries: 'cherry',
  chickpea: 'chickpea', chickpeas: 'chickpea', chana: 'chickpea',
  chives: 'chives', chive: 'chives',
  citrus: 'citrus', orange: 'citrus', oranges: 'citrus', santra: 'citrus', mosambi: 'citrus',
  collards: 'collards', 'collard greens': 'collards',
  coriander: 'coriander', dhania: 'coriander', cilantro: 'coriander',
  cucumber: 'cucumber', cucumbers: 'cucumber', kheera: 'cucumber', kakdi: 'cucumber',
  dill: 'dill', soa: 'dill',
  eggplant: 'eggplant', eggplants: 'eggplant', brinjal: 'eggplant', brinjals: 'eggplant', baingan: 'eggplant',
  fenugreek: 'fenugreek', methi: 'fenugreek',
  fig: 'fig', figs: 'fig', anjeer: 'fig',
  garlic: 'garlic', lehsun: 'garlic', lahsun: 'garlic',
  grape: 'grape', grapes: 'grape', angoor: 'grape',
  guava: 'guava', guavas: 'guava', amrood: 'guava',
  kale: 'kale',
  kohlrabi: 'kohlrabi', ganthgobi: 'kohlrabi',
  leek: 'leek', leeks: 'leek',
  lemon: 'lemon', lemons: 'lemon', nimbu: 'lemon',
  lentil: 'lentil', lentils: 'lentil', masoor: 'lentil', dal: 'lentil',
  lettuce: 'lettuce',
  lime: 'lime', limes: 'lime',
  mango: 'mango', mangoes: 'mango', aam: 'mango',
  melon: 'melon', melons: 'melon', muskmelon: 'melon', kharbuja: 'melon',
  mint: 'mint', pudina: 'mint',
  okra: 'okra', bhindi: 'okra', ladyfinger: 'okra',
  onion: 'onion', onions: 'onion', pyaaz: 'onion', pyaz: 'onion',
  oregano: 'oregano', ajwain: 'oregano',
  papaya: 'papaya', papayas: 'papaya', papita: 'papaya',
  parsley: 'parsley',
  parsnip: 'parsnip', parsnips: 'parsnip',
  peach: 'peach', peaches: 'peach', aadu: 'peach',
  pear: 'pear', pears: 'pear', nashpati: 'pear',
  pea: 'pea', peas: 'peas', matar: 'pea',
  pepper: 'pepper', peppers: 'pepper', capsicum: 'capsicum', 'bell pepper': 'capsicum', 'shimla mirch': 'capsicum',
  chilli: 'chilli', chillies: 'chilli', chilies: 'chilli', chili: 'chilli', mirch: 'chilli',
  plum: 'plum', plums: 'plum', aloo_bukhara: 'plum',
  pomegranate: 'pomegranate', pomegranates: 'pomegranate', anar: 'pomegranate',
  potato: 'potato', potatoes: 'potato', aloo: 'potato',
  pumpkin: 'pumpkin', pumpkins: 'pumpkin', kaddu: 'pumpkin',
  radish: 'radish', radishes: 'radish', mooli: 'radish',
  raspberry: 'raspberry', raspberries: 'raspberry',
  rhubarb: 'rhubarb',
  'ridge gourd': 'ridge gourd', torai: 'ridge gourd', turai: 'ridge gourd',
  rosemary: 'rosemary',
  sage: 'sage',
  soybean: 'soybean', soybeans: 'soybean', soya: 'soybean',
  spinach: 'spinach', palak: 'spinach',
  squash: 'squash',
  strawberry: 'strawberry', strawberries: 'strawberry',
  'sweet corn': 'sweet corn', corn: 'sweet corn', maize: 'sweet corn', makka: 'sweet corn', bhutta: 'sweet corn',
  'sweet potato': 'sweet potato', 'sweet potatoes': 'sweet potato', shakarkand: 'sweet potato',
  'swiss chard': 'swiss chard', chard: 'swiss chard',
  thyme: 'thyme',
  tomato: 'tomato', tomatoes: 'tomato', tamatar: 'tomato',
  turnip: 'turnip', turnips: 'turnip', shalgam: 'turnip',
  watermelon: 'watermelon', watermelons: 'watermelon', tarbooj: 'watermelon',
  zucchini: 'zucchini', courgette: 'zucchini',
  hibiscus: 'hibiscus', gudhal: 'hibiscus',
  rose: 'rose', roses: 'rose', gulab: 'rose',
  marigold: 'marigold', marigolds: 'marigold', genda: 'marigold',
  jasmine: 'jasmine', mogra: 'jasmine', chameli: 'jasmine',
  bougainvillea: 'bougainvillea',
  sunflower: 'sunflower', sunflowers: 'sunflower', surajmukhi: 'sunflower',
  ginger: 'ginger', adrak: 'ginger',
  turmeric: 'turmeric', haldi: 'turmeric',
  mustard: 'mustard', sarson: 'mustard',
  aloe: 'aloe vera', 'aloe vera': 'aloe vera',
  'curry leaf': 'curry leaf', 'curry leaves': 'curry leaf', 'kadi patta': 'curry leaf',
  lemongrass: 'lemongrass',
  lavender: 'lavender',
  chamomile: 'chamomile',
  lotus: 'lotus',
  lily: 'lily', lilies: 'lily',
  dahlia: 'dahlia', dahlias: 'dahlia',
  zinnia: 'zinnia', zinnias: 'zinnia',
  petunia: 'petunia', petunias: 'petunia',
  chrysanthemum: 'chrysanthemum', guldaudi: 'chrysanthemum',
  'money plant': 'money plant', pothos: 'money plant',
  'snake plant': 'snake plant',
};

const SUPPORTED_PLANTS_SET = new Set([
  ...Object.keys(KNOWN_PLANTS_MAP),
  ...Object.values(KNOWN_PLANTS_MAP),
]);

const NON_PLANT_STOPWORDS = new Set([
  'it', 'them', 'some', 'something', 'anything', 'everything', 'nothing', 'what', 'which',
  'plants', 'plant', 'crops', 'crop', 'vegetables', 'vegetable', 'veggies', 'flowers', 'flower',
  'herbs', 'herb', 'fruits', 'fruit', 'trees', 'tree', 'greens', 'garden', 'gardening',
  'seeds', 'seed', 'seedlings', 'seedling', 'saplings', 'sapling', 'cuttings', 'bulbs',
  'beds', 'bed', 'pots', 'pot', 'containers', 'container', 'bags', 'soil', 'water',
  'sunlight', 'sun', 'shade', 'indoor', 'indoors', 'outdoor', 'outdoors', 'outside', 'inside',
  'home', 'balcony', 'terrace', 'rooftop', 'backyard', 'yard', 'lawn', 'farm', 'field',
  'winter', 'summer', 'monsoon', 'spring', 'autumn', 'fall', 'rabi', 'kharif', 'zaid',
  'here', 'there', 'now', 'today', 'tomorrow', 'well', 'more', 'again', 'better', 'faster',
  'organically', 'naturally', 'my', 'our', 'the', 'a', 'an', 'this', 'that', 'these', 'those',
]);

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
    /(?:^|\s)(-?\d+(?:\.\d+)?)\s*(sq\.?\s*ft\.?|square\s*feet|sq_ft|sq\.?\s*m\.?|square\s*meters?|sq_m|acres?|bighas?|cents?|containers?|pots?|grow\s*bags?)\b/i
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

  // 2. Sunlight hours (e.g. "3 hours of sunlight", "100 hours of sunlight", "0 hours of sun", or standalone "12 hours")
  const sunMatch =
    msg.match(/(?:^|\s)(-?\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b[^.?!]*?\b(?:sunlight|sun|light)\b/i) ||
    msg.match(/\b(?:sunlight|sun)\b[^.?!]*?(-?\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i) ||
    msg.match(/^\s*(?:around\s+|about\s+|roughly\s+)?(-?\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\s*(?:daily|per\s+day|a\s+day)?\s*$/i);
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
    'pots', 'pot', 'containers', 'container', 'beds', 'bed', 'bags', 'bag', 'ground',
    'sq', 'ft', 'feet', 'meters', 'acres', 'inches', 'cm', 'mm', 'rows',
    'hours', 'hour', 'hrs', 'sunlight', 'sun', 'shade', 'direct', 'light', 'space', 'land', 'area',
    'lower', 'upper', 'north', 'south', 'east', 'west', 'central', 'grow', 'growing',
    'plant', 'planting', 'want', 'have', 'and', 'with', 'for', 'the', 'india',
    'soil', 'water', 'watering', 'morning', 'evening', 'afternoon', 'night', 'daily',
    'garden', 'gardening', 'balcony', 'terrace', 'rooftop', 'backyard', 'yard', 'indoors', 'outdoors',
    'general', 'addition', 'fact', 'case', 'detail', 'short', 'mind', 'total', 'order', 'time', 'place',
    'photosynthesis', 'germination', 'transpiration', 'respiration', 'pollination', 'compost', 'mulch',
    'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
    ...SUPPORTED_PLANTS_SET,
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

  // Check "in <City>" when not matched yet (case-insensitive, e.g. "grow hibiscus in solan" or "grow tomatoes in Atlantis")
  if (!detectedLoc?.city) {
    const inCityMatch = msg.match(/\bin\s+([a-zA-Z]{3,20})(?:\s*,\s*([a-zA-Z\s]{2,25}))?(?=\s+(?:in|on|at|with|during|this|for|and)\b|[,.?!]|$)/i);
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
  const detectedPlants = new Set();
  const growMatch = msgLower.match(
    /\b(?:grow|growing|plant|planting)\s+([a-z]+(?:\s+and\s+[a-z]+)?)(?=\s+(?:in|on|at|with|during|for|this|from|near|under)\b|[,.?!]|$)/i
  );
  if (growMatch) {
    growMatch[1]
      .split(/\s+and\s+|,/)
      .map((s) => s.trim())
      .filter((w) => w && !NON_PLANT_STOPWORDS.has(w) && !KNOWN_CITY_STATE_MAP[w] && !INDIAN_STATES_LOWER_SET.has(w))
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
  if (!location) return location;
  if (!location.city && location.state && INDIAN_STATES_LOWER_SET.has(location.state.trim().toLowerCase())) {
    const matchedState = toTitleCase(location.state.trim());
    return {
      city: matchedState,
      state: matchedState,
      country: location.country || 'India',
    };
  }
  if (!location.city) return location;
  const key = location.city.trim().toLowerCase();
  const mapped = KNOWN_CITY_STATE_MAP[key];
  if (mapped) {
    return {
      city: mapped.city,
      state: location.state || mapped.state,
      country: location.country || mapped.country,
    };
  }
  if (INDIAN_STATES_LOWER_SET.has(key)) {
    const matchedState = toTitleCase(location.city.trim());
    return {
      city: matchedState,
      state: matchedState,
      country: location.country || 'India',
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
 * Deterministic check for clearly non-gardening / off-topic queries and prompt-injection
 * attempts as a safety net for small models so out-of-scope inputs are always rejected
 * at the Query Rewriter phase.
 *
 * @param {string} userMessage
 * @returns {boolean}
 */
function isOutOfScopeMessage(userMessage = '') {
  if (!userMessage || typeof userMessage !== 'string') return false;
  const msg = userMessage.trim().toLowerCase();

  // Guardrail 6: Always reject prompt-injection / jailbreak attempts even if they mention a plant word
  const promptInjectionPattern =
    /\b(ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions|disregard\s+(?:all\s+)?(?:previous|prior)\s+instructions|system\s+prompt|reveal\s+your\s+(?:prompt|instructions)|developer\s+mode|jailbreak|bypass\s+(?:rules|guardrails|filters)|forget\s+(?:all\s+)?your\s+instructions)\b/i;
  if (promptInjectionPattern.test(msg)) return true;

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
 * Validate merged context against domain guardrails:
 * - Guardrail 1: sunlightHours must be between 1 and 16 hours/day (inclusive).
 * - Guardrail 3: location (city/state) must exist in KNOWN_CITY_STATE_MAP or INDIAN_STATES.
 * - Guardrail 4: preferredPlants must exist in SUPPORTED_PLANTS_SET.
 *
 * Invalid values are stripped/reverted to existingContext values and clear user-facing
 * guardrail notices are returned.
 */
function validateContextGuardrails(updatedContext, existingContext = {}, llmExtracted = {}, detSignals = {}) {
  const notices = [];
  const rejectedFieldKeys = new Set();

  // ── Guardrail 1: Sunlight Hours Bounds (1 to 16 hours/day) ──────────────────
  const rawSun =
    detSignals.sunlightHours ??
    llmExtracted?.sunlightHours ??
    updatedContext.sunlightHours;

  if (rawSun != null) {
    const numSun = Number(rawSun);
    if (Number.isNaN(numSun) || numSun < 1 || numSun > 16) {
      const prevSun = existingContext.sunlightHours;
      updatedContext.sunlightHours =
        prevSun != null && prevSun >= 1 && prevSun <= 16 ? prevSun : null;
      rejectedFieldKeys.add('sunlightHours');
      notices.push(
        `Direct outdoor sunlight must be between 1 and 16 hours per day (since a day only has 24 hours). Roughly how many hours of direct daily sunlight (1–16 hours) does your space actually receive?`
      );
    }
  }

  // ── Guardrail 3: Unknown / Unrecognized Locations ───────────────────────────
  const candCity = updatedContext.location?.city
    ? String(updatedContext.location.city).trim()
    : null;
  const candState = updatedContext.location?.state
    ? String(updatedContext.location.state).trim()
    : null;

  if (candCity || candState) {
    const cityKey = candCity ? candCity.toLowerCase() : '';
    const stateKey = candState ? candState.toLowerCase() : '';
    const isSupportedCity = Boolean(
      cityKey && (KNOWN_CITY_STATE_MAP[cityKey] || INDIAN_STATES_LOWER_SET.has(cityKey))
    );
    const isSupportedStateOnly = Boolean(
      !cityKey && stateKey && INDIAN_STATES_LOWER_SET.has(stateKey)
    );

    if (!isSupportedCity && !isSupportedStateOnly) {
      const rejectedPlace = candCity || candState;
      const prevLoc = existingContext.location;
      const prevCityKey = prevLoc?.city ? String(prevLoc.city).trim().toLowerCase() : '';
      const prevIsValid = Boolean(
        prevCityKey && (KNOWN_CITY_STATE_MAP[prevCityKey] || INDIAN_STATES_LOWER_SET.has(prevCityKey))
      );
      updatedContext.location = prevIsValid
        ? JSON.parse(JSON.stringify(prevLoc))
        : { city: null, state: null, country: null };
      rejectedFieldKeys.add('location.city');
      notices.push(
        `I don't have local climate data for "${rejectedPlace}" in my knowledge base yet. Please share a supported city or Indian state (for example: Gorakhpur, Lucknow, Shimla, Bhopal, Pune, Mumbai, Bengaluru, Delhi, Jaipur, Chennai, Kolkata, or Patna).`
      );
    }
  }

  // ── Guardrail 4: Unknown / Non-Plant Items ──────────────────────────────────
  const candidatePlants = [
    ...(updatedContext.preferredPlants ?? []),
    ...(llmExtracted?.preferredPlants ?? []),
    ...(detSignals.preferredPlants ?? []),
  ];

  if (candidatePlants.length > 0) {
    const validPlants = new Set();
    const rejectedPlants = new Set();

    for (const rawP of candidatePlants) {
      const norm = String(rawP || '').toLowerCase().trim();
      if (!norm || NON_PLANT_STOPWORDS.has(norm)) continue;
      if (KNOWN_CITY_STATE_MAP[norm] || INDIAN_STATES_LOWER_SET.has(norm)) continue;

      const canonical =
        KNOWN_PLANTS_MAP[norm] || (SUPPORTED_PLANTS_SET.has(norm) ? norm : null);
      if (canonical) {
        validPlants.add(canonical);
      } else {
        rejectedPlants.add(rawP.trim());
      }
    }

    updatedContext.preferredPlants = [...validPlants];

    if (rejectedPlants.size > 0) {
      rejectedFieldKeys.add('preferredPlants');
      notices.push(
        `I don't have verified plant care data for "${[...rejectedPlants].join(', ')}" in my knowledge base yet. Please choose a supported vegetable, herb, fruit, or flower (such as tomato, potato, chilli, spinach, carrot, cucumber, okra, hibiscus, rose, marigold, sunflower, tulsi, coriander, mint, or lemon).`
      );
    }
  }

  return { notices, rejectedFieldKeys };
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

  // ── FAST-PATH 0 (0 LLM Calls): Guardrail 6 max 600 character length ──────────
  if (typeof userMessage === 'string' && userMessage.trim().length > 600) {
    logger.info('[QueryRewriter] Fast-path (0 LLM calls): Rejecting message exceeding 600 characters.');
    const decision = RouterDecisionSchema.parse({
      status: 'READY',
      intent: 'OUT_OF_SCOPE',
      normalizedQuery: userMessage.trim().slice(0, 600),
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
      directAnswer:
        'Please keep your message within 600 characters so I can process your gardening request accurately.',
    });
    return {
      decision,
      updatedContext: existingContext,
      updatedPreferences: existingPreferences,
    };
  }

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

  // Validate merged context against Guardrails 1, 3, and 4
  const { notices: guardrailNotices, rejectedFieldKeys } = validateContextGuardrails(
    updatedContext,
    existingContext,
    decision.extractedContext ?? {},
    deterministicSignals
  );

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

  if (guardrailNotices.length > 0) {
    decision.status = 'NEEDS_CONTEXT';
    decision.missingRequiredContext = missing;
    decision.needsPlanner = false;
    decision.needsKnowledge = false;
    decision.needsClimateKnowledge = false;

    const otherMissing = missing.filter((k) => !rejectedFieldKeys.has(k));
    if (otherMissing.length > 0) {
      const followUp = buildClarificationForMissing(otherMissing, updatedContext);
      decision.clarificationQuestion = `${guardrailNotices.join(' ')} ${followUp}`;
    } else {
      decision.clarificationQuestion = guardrailNotices.join(' ');
    }
  } else if (isComplete) {
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
  KNOWN_PLANTS_MAP,
  SUPPORTED_PLANTS_SET,
  extractDeterministicSignals,
  validateContextGuardrails,
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
