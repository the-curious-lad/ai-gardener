# climate_location_knowledge dataset (pilot build, expanded: 70 records)

Layer 2 of the gardening assistant's three knowledge layers: **what a LOCATION + REGION + SEASON means for gardening.** Layer 1 is plant_health_knowledge; layer 3 is the user's garden session state.

## What it does
- Maps places to regional context (LOCATION_MAPPING).
- Describes regional rainfall patterns (REGIONAL_CLIMATE) and what a named season means in a given region (SEASONAL_CONTEXT).
- Documents classification frameworks used (CLIMATE_ZONE).

## What it deliberately does NOT do
No weather data, forecasts, current temperatures, plant requirements, diseases or crop schedules. Cities are mapping anchors, not climate records.

## Status: pilot, not the 300-700 target
70 records were verifiable in this pass. Coverage is Indian districts (UP, Bihar, Odisha, Gujarat, Uttarakhand, Karnataka, Rajasthan, Maharashtra, Tamil Nadu, Assam, Himachal, MP, Punjab, Kerala, West Bengal) and the 15 Planning Commission regions plus UK, Australia, Singapore and USA frameworks. See climate_location_research_report.md for gaps.

## Geographic hierarchy
For India the hierarchy follows ICAR-CRIDA district contingency plans: district -> NARP agro-climatic zone (subregion) -> Planning Commission agro-climatic region (region) -> India. ICAR agro-ecological sub-region is recorded in climate_zone / climate_classification_system. Compass labels (North/South India) are **not** used because they are not in the sources. Note: the example hierarchy 'Gorakhpur -> Eastern UP -> North India' is not stated by ICAR; the source gives Middle Gangetic Plain Region (IV) / North Eastern Plain Zone (UP-8).

## Meaning of seasons
A season is only meaningful with a region. Records carry the source's own season label in `season` and a normalized value in `normalized_season`. Examples: in Kancheepuram the October-December NE monsoon is the main rainy season; in Ernakulam January-March ('winter') is nearly dry while April-May is wet; in Singapore there are no four seasons; in northern Australia the wet season is October-April. The all-India IMD calendar (SEA_IN_IMD_*) gives month boundaries only, not conditions.

## Normalized season vocabulary
WINTER, SUMMER, SPRING, AUTUMN, FALL, MONSOON, WET_SEASON, DRY_SEASON, YEAR_ROUND, TRANSITIONAL, UNKNOWN. (Used so far: AUTUMN, DRY_SEASON, MONSOON, SPRING, SUMMER, TRANSITIONAL, WET_SEASON, WINTER, YEAR_ROUND.)

## Climate classification methodology
Only classifications printed by the source are recorded, and the system is named. No Koppen-Geiger value is included. Plan zone codes can conflict between plans; conflicts are noted and statuses set accordingly.

## Source hierarchy
ICAR/ICAR-CRIDA, Government of India, state agricultural universities (TNAU, KAU), national meteorological agencies (BoM, MSS), USDA, Royal Meteorological Society. A non-peer-reviewed preprint is used only as supporting corroboration. Blogs, tourism and coaching sites were seen in search results and excluded.

## Anti-hallucination policy
Unverified fields are blank or UNKNOWN. No invented temperatures, ranges, classifications or URLs. Numbers are copied as printed; any computed share is stated as computed. Statements derived from sourced figures are prefixed DERIVED.

## Schema
record_id, knowledge_type, location_name, state_province, country, subregion, region, climate_zone, climate_classification_system, latitude_band, longitude_band, season, normalized_season, typical_temperature_context, temperature_range, rainfall_pattern, humidity_pattern, frost_risk, heat_risk, general_growing_conditions, seasonal_gardening_implications, soil_environment_context, water_management_context, planting_window_context, location_context, knowledge_text, source_name, source_url, secondary_source_name, secondary_source_url, evidence_notes, confidence_level, last_verified

## Record counts
- REGIONAL_CLIMATE: 31
- SEASONAL_CONTEXT: 19
- LOCATION_MAPPING: 18
- CLIMATE_ZONE: 2

## Source audit methodology
climate_location_source_audit.csv has one row per record. verification_status values: VERIFIED (authoritative primary source plus independent corroboration of the central claim); PARTIALLY_VERIFIED (some claims corroborated, others single-source); PRIMARY_ONLY (authoritative primary source, no secondary found); SINGLE_SOURCE (one non-primary compilation, e.g. a university e-text, not cross-checked); PARTIALLY_CONFLICTING / CONFLICTING_MINOR (sources differ; see notes). Verification was done on 2026-10-07 from retrieved text; for most ICAR plans only the summary page excerpt (zone and rainfall rows) was read, not the whole PDF.

## Limitations
See the research report: dated plan data, unstated averaging periods, inconsistent zone codes, no temperature/frost/heat figures for India, narrow global coverage.

## Ingestion into MongoDB Atlas
1. Load the CSV (e.g. pandas), keep every column as a field; treat blank cells as missing, not as empty strings.
2. Create the embedding from `knowledge_text` (optionally prefixed with location_name, region and season) and store it in an `embedding` field. Use one embedding model consistently.
3. Insert into a collection such as `climate_location_knowledge`; keep `record_id` as a unique key.
4. Create an Atlas Vector Search index, for example:
```
{"fields":[
 {"type":"vector","path":"embedding","numDimensions":<model dimension>,"similarity":"cosine"},
 {"type":"filter","path":"knowledge_type"},
 {"type":"filter","path":"country"},
 {"type":"filter","path":"region"},
 {"type":"filter","path":"normalized_season"},
 {"type":"filter","path":"climate_zone"}
]}
```

## Using it with Atlas Vector Search
- Where is X? -> filter knowledge_type = LOCATION_MAPPING; match location_name; read region/subregion.
- What does season S mean in X? -> take the region/subregion from the mapping, then query SEASONAL_CONTEXT filtered by region/climate_zone and normalized_season.
- Month to season: use the regional record if one exists; otherwise fall back to IMD (India) or the Met Office / BoM conventions, and say it is a calendar default.
- Treat `UNKNOWN` frost_risk/heat_risk as 'no data', never as 'low'.
- Combine with plant_health_knowledge in the planner; this dataset only supplies environmental context.
