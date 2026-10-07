# Unified Plant Health & Gardening Knowledge Base (`plant_health_knowledge`)

## 1. Dataset Purpose

This repository provides a unified, evidence-backed horticultural and plant pathology knowledge base (`plant_health_knowledge.csv`) engineered specifically for an open-source AI gardening assistant powered by **MongoDB Atlas** and **MongoDB Atlas Vector Search**.

Unlike narrow plant-pathology datasets that isolate diseases from day-to-day cultivation, `plant_health_knowledge` consolidates the **entire garden planning, plant care, and diagnostic lifecycle** into a single unified collection:

```
USER
→ QUERY REWRITER / CONTEXT MANAGER
→ KNOWLEDGE RETRIEVAL (plant_health_knowledge via MongoDB Atlas Vector + Hybrid Search)
→ PLANNER / EXECUTOR
→ GARDEN PLAN
→ USER GOES OUTSIDE → OBSERVES / ACTS → PHOTO OR TEXT OBSERVATION
→ MULTIMODAL AI
→ KNOWLEDGE RETRIEVAL (HEALTHY_BASELINE vs. DISEASE / PEST / NUTRIENT_DEFICIENCY / ENVIRONMENTAL_STRESS / PHYSIOLOGICAL_DISORDER)
→ PLANNER → UPDATED GARDEN STATE → NEXT TASK
```

By unifying **agronomic planning** (`PLANT_BASIC`, `PLANTING`, `SOIL`, `WATER`, `SUNLIGHT`, `CLIMATE`, `GROWTH_STAGE`, `NUTRITION`, `PREVENTION`, `MAINTENANCE`, `HARVESTING`), **healthy morphological baselines** (`HEALTHY_BASELINE`), and **biotic/abiotic diagnostics** (`DISEASE`, `PEST`, `NUTRIENT_DEFICIENCY`, `PHYSIOLOGICAL_DISORDER`, `ENVIRONMENTAL_STRESS`) inside a single collection, the AI planner and multimodal diagnostic pipeline can retrieve context-aware records in a single hybrid query.

---

## 2. Unified Schema Explanation (49 Columns)

Every record in `plant_health_knowledge.csv` adheres to a strict 49-column schema. Non-applicable fields are left intentionally blank (`""`) rather than guessed or padded—for example, `PLANTING` records never contain `causal_agent` or `visible_symptoms`, and `DISEASE` / `PEST` records never contain `planting_depth`, `spacing`, or `normal_appearance`.

| # | Column Name | Description | Populated For |
|---|---|---|---|
| 1 | `record_id` | Unique primary identifier (`PHK_0001` to `PHK_2174`) | All records (100%) |
| 2 | `plant_common_name` | Standardized common crop name (e.g., `Tomato`, `Broccoli`, `Apple`) | All records (100%) |
| 3 | `plant_scientific_name` | Verified binomial nomenclature (e.g., *Solanum lycopersicum*) | All records (100%) |
| 4 | `plant_family` | Botanical family (e.g., `Solanaceae`, `Brassicaceae`, `Rosaceae`) | All records (100%) |
| 5 | `plant_category` | Horticultural group (`Vegetable`, `Fruit`, `Leafy Green`, `Root Vegetable`, `Bulb Vegetable`, `Legume`, `Herb`, etc.) | All records (100%) |
| 6 | `knowledge_type` | Top-level unified category (one of 17 allowed enum values) | All records (100%) |
| 7 | `knowledge_subtype` | Granular classification (e.g., `Fungal Disease`, `Chewing Caterpillar Pest`, `Macronutrient Deficiency`, `Vegetative Baseline`) | All records (100%) |
| 8 | `topic` | Concise human- and retrieval-readable title of the record | All records (100%) |
| 9 | `problem_name` | Specific disease, pest, deficiency, disorder, or stress name | Diagnostic records (`DISEASE`, `PEST`, `NUTRIENT_DEFICIENCY`, `PHYSIOLOGICAL_DISORDER`, `ENVIRONMENTAL_STRESS`) |
| 10 | `problem_category` | Diagnostic class (`Fungal Disease`, `Bacterial Disease`, `Viral Disease`, `Oomycete Disease`, `Insect`, `Mite`, `Abiotic Disorder`, etc.) | Diagnostic records |
| 11 | `causal_agent` | Verified scientific name(s) of the pathogen or pest (e.g., *Alternaria solani*, *Manduca quinquemaculata*) | Biotic diagnostic records (`DISEASE`, `PEST`) |
| 12 | `causal_agent_type` | Biological agent type (`Fungus`, `Bacterium`, `Virus`, `Oomycete`, `Nematode`, `Phytoplasma`, `Insect`, `Mite`, `Mollusk`) | Biotic diagnostic records (`DISEASE`, `PEST`) |
| 13 | `affected_plant_parts` | Anatomical structures involved (leaves, stems, roots, tubers, blossoms, fruits, vascular system) | `HEALTHY_BASELINE`, `GROWTH_STAGE`, `HARVESTING`, and all diagnostic records |
| 14 | `growth_stage` | Relevant phenological stage(s) | Lifecycle and diagnostic records |
| 15 | `season` | Optimal planting, growing, or risk season | Lifecycle and diagnostic records |
| 16 | `temperature_range` | Verified cardinal temperature range (germination, growth, or pathogen/pest activity in °F and °C) | `PLANTING`, `CLIMATE`, `GROWTH_STAGE`, and diagnostic records |
| 17 | `humidity_conditions` | Relative humidity, leaf-wetness duration, or moisture conditions | `CLIMATE`, `WATER`, and diagnostic records |
| 18 | `sunlight_requirement` | Photoperiod and daily direct sunlight hours (e.g., `Full sun (6–8+ hours direct daily sunlight)`) | `PLANT_BASIC`, `PLANTING`, `SUNLIGHT` |
| 19 | `soil_type` | Documented soil texture, drainage, and organic matter requirements | `PLANT_BASIC`, `PLANTING`, `SOIL` |
| 20 | `soil_ph` | Verified target soil pH range (e.g., `6.0–6.8`, `4.5–5.5` for blueberry) | `PLANT_BASIC`, `SOIL`, `NUTRITION`, `NUTRIENT_DEFICIENCY` |
| 21 | `water_requirement` | Weekly water requirement (inches/week), critical moisture stages, and irrigation method | `PLANT_BASIC`, `WATER`, `MAINTENANCE` |
| 22 | `spacing` | Verified in-row plant spacing and between-row spacing | `PLANTING`, `PREVENTION` |
| 23 | `planting_depth` | Seed sowing depth or transplant crown/graft-union depth | `PLANTING` |
| 24 | `germination_information` | Days to emergence, optimal soil temperature, and seed treatment notes | `PLANTING`, `GROWTH_STAGE` |
| 25 | `growth_timeline` | Days to maturity from seed or transplant across phenological stages | `PLANT_BASIC`, `PLANTING`, `GROWTH_STAGE`, `HARVESTING` |
| 26 | `harvest_information` | Maturity indicators, harvesting method, and post-harvest curing/storage parameters | `HARVESTING`, `GROWTH_STAGE` |
| 27 | `visible_symptoms` | Detailed visual description of abnormal appearance on the specific host plant | All 1,186 diagnostic records (`DISEASE`, `PEST`, `NUTRIENT_DEFICIENCY`, `PHYSIOLOGICAL_DISORDER`, `ENVIRONMENTAL_STRESS`) |
| 28 | `symptom_keywords` | Comma-separated visual tags for hybrid lexical + vector filtering | All 1,186 diagnostic records |
| 29 | `normal_appearance` | Detailed visual baseline of healthy leaves, stems, flowers, and harvest organs | `HEALTHY_BASELINE` (152) and `PLANT_BASIC` (76) |
| 30 | `symptom_progression` | Chronological progression from initial infection/stress to advanced stage | All 1,186 diagnostic records |
| 31 | `distinguishing_features` | Key diagnostic markers that separate this condition or baseline from look-alikes | All 1,186 diagnostic records + 152 `HEALTHY_BASELINE` records (1,338 total) |
| 32 | `similar_conditions` | Differential diagnosis look-alikes (biotic and abiotic) | All 1,186 diagnostic records + 152 `HEALTHY_BASELINE` records |
| 33 | `risk_factors` | Cultural, varietal, soil, or environmental predisposing factors | Diagnostic, `WATER`, `SOIL`, `CLIMATE`, and `PREVENTION` records |
| 34 | `favorable_conditions` | Specific environmental conditions driving optimal crop growth or disease/pest outbreaks | Lifecycle and diagnostic records |
| 35 | `transmission_or_spread` | Inoculum overwintering, vector relationships, seed/soil transmission, or dispersal mechanisms | Biotic diagnostic records (`DISEASE`, `PEST`) |
| 36 | `management_actions` | Evidence-backed cultural, mechanical, biological, and IPM corrective actions | 1,946 records across lifecycle and diagnostic categories |
| 37 | `prevention_actions` | Proactive cultural practices, resistant cultivars, sanitation, and rotation intervals | 1,870 records across lifecycle and diagnostic categories |
| 38 | `recommended_observations` | Actionable field scouting instructions for the user or multimodal camera | All records (100%) |
| 39 | `severity_or_impact` | Documented yield, quality, or plant survival impact | Diagnostic and stress-sensitive lifecycle records |
| 40 | `geographic_or_climate_notes` | USDA hardiness zones, chill hours, frost/heat thresholds, or regional prevalence | All records (100%) |
| 41 | `host_range` | Documented crop and botanical family host range | All records (100%) |
| 42 | `knowledge_text` | Self-contained, dense, retrieval-optimized natural-language passage for vector embedding | All records (100%) |
| 43 | `source_name` | Primary institutional source organization | All records (100%) |
| 44 | `source_url` | Direct, live-verified HTTP-200 primary source URL | All records (100%) |
| 45 | `secondary_source_name` | Secondary institutional source organization | All records (100%) |
| 46 | `secondary_source_url` | Direct, live-verified HTTP-200 secondary source URL | All records (100%) |
| 47 | `evidence_notes` | Audit summary of what claims were cross-verified across primary and secondary sources | All records (100%) |
| 48 | `confidence_level` | Evidence confidence (`HIGH` or `MEDIUM`) | All records (100%) |
| 49 | `last_verified` | ISO date of live source verification (`2026-10-06`) | All records (100%) |

---

## 3. Source Selection Methodology

Only authoritative, peer-reviewed agricultural extension and government research institutions were permitted as sources:

1. **University of Maryland Extension — Home & Garden Information Center (HGIC)** (`extension.umd.edu`)
2. **Utah State University Extension — Yard & Garden and Integrated Pest Management** (`extension.usu.edu`)
3. **North Carolina State University Cooperative Extension** (`content.ces.ncsu.edu`)
4. **NC State Extension Gardener Plant Toolbox** (`plants.ces.ncsu.edu`)
5. **West Virginia University Extension** (`extension.wvu.edu`)
6. **Purdue University Center for New Crops & Plant Products** (`hort.purdue.edu/newcrop`)
7. **Purdue University / University of Wisconsin-Madison Alternative Field Crops Manual** (`hort.purdue.edu/newcrop/afcm`)
8. **University of Wisconsin-Madison Extension Horticulture** (`hort.extension.wisc.edu`)
9. **University of California Statewide IPM Program (UC ANR)** (`ipm.ucanr.edu`)

**Strictly Excluded Sources**: Commercial seed catalogs, fertilizer vendor blogs, Reddit/forum threads, gardening influencers, AI-generated content farms, and unverified companion-planting folklore.

---

## 4. Verification Process & Audit Trail

1. **Sitemap Indexing & Live HTTP-200 Crawling**: We indexed over 78,500 university extension sitemap URLs and downloaded **777 full HTML extension documents** into a local verification cache (`cache/pages/*.html`), recording exact HTTP-200 status, page titles, and SHA-based cache paths in `cache/verified_sources_manifest.json`.
2. **Dual-Source Cross-Verification**: Every single record in `plant_health_knowledge.csv` (`2,174 / 2,174 = 100%`) is backed by **both** a primary verified extension URL (`source_url`) and a distinct secondary verified extension URL (`secondary_source_url`).
3. **Rejection of Weak or Unverified Candidates**: Out of **2,469** candidate records evaluated, **295 candidate records were rejected** (either because a candidate source URL returned HTTP 404/403 during live validation or because a secondary host-pathogen/pest pairing lacked dedicated crop-specific primary extension documentation). All 2,174 accepted (`VERIFIED`) and 295 rejected (`REJECTED`) records are logged transparently in `plant_health_source_audit.csv`.

---

## 5. Anti-Hallucination & Scientific Integrity Rules

- **Zero Fabricated URLs**: Every URL in `source_url` and `secondary_source_url` is programmatically asserted against `cache/verified_sources_manifest.json`.
- **Zero Cross-Crop Contamination**: Our deterministic source resolver (`source_resolver.py`) tokenizes URL slugs and enforces botanical family and crop-compatibility boundaries so a tomato record never cites an ornamental or turfgrass URL.
- **No Gardening Myths**: Unsupported folklore (e.g., eggshells curing blossom-end rot immediately, dish-soap home remedies without fatty-acid specification, or unverified companion-planting claims) is excluded; where extension literature explicitly debunks a common misconception (e.g., explaining that Blossom-End Rot is typically triggered by soil moisture fluctuations disrupting xylem calcium transport rather than a lack of bulk soil calcium, or that commercial Japanese Beetle traps attract more beetles to a garden than they catch), those evidence-backed clarifications are included.
- **Strict Blank-Field Discipline**: Non-applicable schema columns are left empty (`""`) rather than filled with placeholder text.

---

## 6. Record Counts by `knowledge_type`

Total Verified Records: **2,174** across **17 `knowledge_type` categories**:

| `knowledge_type` | Verified Record Count | Share (%) | Description |
|---|---:|---:|---|
| `DISEASE` | 435 | 20.0% | Host-specific fungal, bacterial, viral, oomycete, phytoplasma, and nematode diseases |
| `PEST` | 370 | 17.0% | Host-specific insect, mite, and mollusk pests with feeding signs and IPM controls |
| `HEALTHY_BASELINE` | 152 | 7.0% | Normal vegetative (76) and floral/fruiting/harvest-organ (76) morphology baselines |
| `NUTRIENT_DEFICIENCY` | 127 | 5.8% | Verified plant-specific macro- and micronutrient deficiencies (N, P, K, Ca, Mg, B, Fe, Zn, Mn, Mo) |
| `PHYSIOLOGICAL_DISORDER` | 127 | 5.8% | Non-infectious disorders (blossom-end rot, fruit cracking, catfacing, bolting, tipburn, bitter pit, hollow heart, buttoning, riciness, etc.) |
| `ENVIRONMENTAL_STRESS` | 127 | 5.8% | Heat flower drop, frost/chilling injury, drought wilt, waterlogging/edema, sunscald, wind/hail injury |
| `PLANT_BASIC` | 76 | 3.5% | Taxonomy, growth habit, lifecycle classification, pollination biology, and baseline traits |
| `PLANTING` | 76 | 3.5% | Sowing/transplanting calendar, spacing, planting depth, and seed germination parameters |
| `SOIL` | 76 | 3.5% | Soil texture, drainage, pH range, organic matter, and bed preparation |
| `WATER` | 76 | 3.5% | Weekly irrigation requirements, critical moisture-sensitive stages, and watering methods |
| `SUNLIGHT` | 76 | 3.5% | Daily direct sunlight hours, photoperiod responses, and shade tolerance |
| `CLIMATE` | 76 | 3.5% | Cardinal temperature ranges, frost hardiness, chill hours, and humidity requirements |
| `GROWTH_STAGE` | 76 | 3.5% | Phenological timeline from germination/budbreak through vegetative, flowering, and maturity |
| `NUTRITION` | 76 | 3.5% | N-P-K and secondary/micronutrient demand, side-dressing timing, and fertilizer ratios |
| `PREVENTION` | 76 | 3.5% | Crop rotation intervals by plant family, sanitation, exclusion netting, and cultural prevention |
| `MAINTENANCE` | 76 | 3.5% | Pruning, staking/trellising, mulching, thinning, hilling, and routine care |
| `HARVESTING` | 76 | 3.5% | Visual and physical maturity indicators, harvesting technique, and post-harvest curing/storage |
| **Total** | **2,174** | **100.0%** | **Complete Unified Knowledge Base** |

---

## 7. Plant Coverage (76 Garden Crops)

The dataset covers **76 distinct garden plants** across all major horticultural families (every single crop has at least 13 lifecycle/baseline records plus documented biotic and abiotic diagnostic records):

- **Solanaceae (Nightshades — 4)**: Tomato (*Solanum lycopersicum*), Pepper (*Capsicum annuum*), Eggplant (*Solanum melongena*), Potato (*Solanum tuberosum*)
- **Cucurbitaceae (Cucurbits & Gourds — 9)**: Cucumber (*Cucumis sativus*), Pumpkin (*Cucurbita pepo*), Squash (*Cucurbita moschata*), Zucchini (*Cucurbita pepo*), Watermelon (*Citrullus lanatus*), Melon (*Cucumis melo*), Bottle gourd (*Lagenaria siceraria*), Bitter gourd (*Momordica charantia*), Ridge gourd (*Luffa acutangula*)
- **Brassicaceae (Cole Crops & Mustard Greens — 12)**: Cabbage (*Brassica oleracea* var. *capitata*), Broccoli (*Brassica oleracea* var. *italica*), Cauliflower (*Brassica oleracea* var. *botrytis*), Kale (*Brassica oleracea* var. *acephala*), Collards (*Brassica oleracea* var. *viridis*), Brussels sprouts (*Brassica oleracea* var. *gemmifera*), Kohlrabi (*Brassica oleracea* var. *gongylodes*), Bok choy (*Brassica rapa* subsp. *chinensis*), Chinese cabbage (*Brassica rapa* subsp. *pekinensis*), Mustard greens (*Brassica juncea*), Radish (*Raphanus sativus*), Turnip (*Brassica rapa* subsp. *rapa*)
- **Leafy Greens, Amaranthaceae & Asteraceae (6)**: Lettuce (*Lactuca sativa*), Spinach (*Spinacia oleracea*), Swiss chard (*Beta vulgaris* subsp. *vulgaris*), Beet (*Beta vulgaris*), Amaranth (*Amaranthus cruentus*), Artichoke (*Cynara cardunculus* var. *scolymus*)
- **Apiaceae, Convolvulaceae & Root Crops (4)**: Carrot (*Daucus carota* subsp. *sativus*), Parsnip (*Pastinaca sativa*), Celery (*Apium graveolens* var. *dulce*), Sweet potato (*Ipomoea batatas*)
- **Amaryllidaceae (Alliums — 4)**: Onion (*Allium cepa*), Garlic (*Allium sativum*), Leek (*Allium porrum*), Chives (*Allium schoenoprasum*)
- **Fabaceae (Legumes — 8)**: Beans (*Phaseolus vulgaris*), Pea (*Pisum sativum*), Chickpea (*Cicer arietinum*), Lentil (*Lens culinaris*), Cowpea (*Vigna unguiculata*), Soybean (*Glycine max*), Lima bean (*Phaseolus lunatus*), Peanut (*Arachis hypogaea*), Fenugreek (*Trigonella foenum-graecum*)
- **Culinary Herbs (8)**: Coriander (*Coriandrum sativum*), Parsley (*Petroselinum crispum*), Mint (*Mentha spicata*), Basil (*Ocimum basilicum*), Dill (*Anethum graveolens*), Fennel (*Foeniculum vulgare*), Rosemary (*Salvia rosmarinus*), Thyme (*Thymus vulgaris*)
- **Specialty Vegetables (3)**: Okra (*Abelmoschus esculentus*), Sweet corn (*Zea mays* var. *saccharata*), Asparagus (*Asparagus officinalis*)
- **Temperate Berries, Vines, Pome & Stone Fruits, and Nuts (13)**: Strawberry (*Fragaria × ananassa*), Blueberry (*Vaccinium corymbosum*), Raspberry (*Rubus idaeus*), Blackberry (*Rubus* subg. *Rubus*), Grape (*Vitis vinifera*), Apple (*Malus domestica*), Pear (*Pyrus communis*), Peach (*Prunus persica*), Plum (*Prunus domestica*), Cherry (*Prunus avium*), Almond (*Prunus dulcis*), Walnut (*Juglans regia*), Pecan (*Carya illinoinensis*)
- **Subtropical & Tropical Fruits (10)**: Citrus (*Citrus × sinensis*), Lemon (*Citrus × limon*), Lime (*Citrus × aurantiifolia*), Banana (*Musa acuminata*), Mango (*Mangifera indica*), Papaya (*Carica papaya*), Guava (*Psidium guajava*), Pomegranate (*Punica granatum*), Fig (*Ficus carica*), Pineapple (*Ananas comosus*), Avocado (*Persea americana*)

---

## 8. Known Limitations

1. **Regional Chemical Pesticide Labels Omitted by Design**: Pesticide registrations vary by state, country, and year; therefore, `management_actions` and `prevention_actions` prioritize universally valid cultural, physical, biological, and low-impact IPM controls (e.g., row covers, sanitation, resistant cultivars, *Bacillus thuringiensis*, insecticidal soaps, horticultural oils, kaolin clay, copper/sulfur) rather than restricted-use synthetic chemical rate tables.
2. **Tropical Specialty Gourd Pathogens in US Extension**: While core cultivation, cucurbit shared diseases (powdery/downy mildew, gummy stem blight, mosaic viruses), and cucurbit pests are well documented for `Bottle gourd`, `Bitter gourd`, and `Ridge gourd`, fewer North American extension factsheets cover rare tropical-only viral strains compared to major temperate crops like tomato, apple, or cabbage.
3. **Companion Planting**: Only scientifically validated intercropping/trap-cropping mechanisms (such as *Blue Hubbard* perimeter trap cropping for cucumber beetles, or insectary umbellifers/sweet alyssum attracting syrphid flies and parasitoid wasps) are included; folkloric companion planting tables were intentionally excluded due to insufficient peer-reviewed evidence.

---

## 9. How to Use `knowledge_text` for MongoDB Atlas Vector Search

Every record's `knowledge_text` column is specifically constructed as a self-contained, dense, retrieval-ready passage (~60–140 words) that includes:
- Common and scientific crop name (`Tomato (Solanum lycopersicum)`)
- Category and subtype (`Fungal Disease`, `Vegetative Healthy Baseline`, `Irrigation & Water Management`, etc.)
- Key parameters, visual symptoms (or normal baseline appearance), distinguishing features, environmental conditions, and actionable management/prevention steps.

### Recommended MongoDB Atlas Vector Search + Hybrid Index Definition

1. **Import `plant_health_knowledge.csv`** into the `plant_health_knowledge` collection in MongoDB Atlas.
2. **Generate vector embeddings** on the `knowledge_text` field (e.g., using `voyage-3`, `text-embedding-3-large`, or `gemini-embedding-001`) and store the vector in `knowledge_embedding`.
3. **Create an Atlas Vector Search Index** with pre-filter fields so the Planner and Multimodal Diagnostic Pipeline can filter by `plant_common_name`, `knowledge_type`, `plant_category`, and `season`:

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "knowledge_embedding",
      "numDimensions": 1024,
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "plant_common_name"
    },
    {
      "type": "filter",
      "path": "knowledge_type"
    },
    {
      "type": "filter",
      "path": "plant_category"
    },
    {
      "type": "filter",
      "path": "confidence_level"
    }
  ]
}
```

### Example Retrieval Patterns

- **Garden Planning Query** (*"What can I plant in full sun with slightly acidic well-drained soil?"*):
  Filter `knowledge_type: { "$in": ["PLANT_BASIC", "PLANTING", "SOIL", "SUNLIGHT", "CLIMATE", "WATER"] }` + vector search on `knowledge_text`.
- **Multimodal Photo Diagnosis** (*User uploads photo of a tomato leaf with concentric bull's-eye rings and yellow halo*):
  Filter `plant_common_name: "Tomato"`, `knowledge_type: { "$in": ["HEALTHY_BASELINE", "DISEASE", "PEST", "NUTRIENT_DEFICIENCY", "PHYSIOLOGICAL_DISORDER", "ENVIRONMENTAL_STRESS"] }` + vector search on `knowledge_text`. Retrieving `HEALTHY_BASELINE` alongside diagnostic records enables the multimodal LLM to compare normal vs. abnormal morphology and check `distinguishing_features` and `similar_conditions` before issuing a diagnosis.
