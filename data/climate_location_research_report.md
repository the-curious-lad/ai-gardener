# Research report: climate_location_knowledge (pilot build, expanded)

Verified on 2026-10-07. Total records: **70** (target 300-700 was NOT reached; no records were padded).

## Records by knowledge_type
- REGIONAL_CLIMATE: 31
- SEASONAL_CONTEXT: 19
- LOCATION_MAPPING: 18
- CLIMATE_ZONE: 2

## Records by country
- India: 61
- United Kingdom: 4
- Australia: 3
- Singapore: 1
- United States: 1

## Records by region
- West Coast Plains and Ghat Region (XII): 9
- Middle Gangetic Plain Region (IV): 8
- East Coast Plains and Hills Region (XI): 6
- India (all-India IMD season framework): 4
- Southern Plateau and Hills Region (X): 4
- Western Dry Region (XIV): 4
- United Kingdom (Met Office convention): 4
- Western Plateau and Hills Region (IX): 3
- Eastern Himalayan Region (II): 3
- Western Himalayan Region (I): 3
- Trans-Gangetic Plains Region (VI): 3
- Gujarat Plains and Hills Region (XIII): 3
- Lower Gangetic Plain Region (III): 2
- Northern Australia (tropics): 2
- Western Dry Region (Planning Commission): 1
- Central Plateau and Hills Region (VIII, 52%) and Western Plateau and Hills Region (IX, 48%): 1
- Western Dry Region: 1
- India: 1
- Australia (temperate south and most of the country): 1
- Singapore (equatorial): 1
- United States: 1
- Central Plateau and Hills Region (VIII) and Western Plateau and Hills Region (IX): 1
- Upper Gangetic Plains Region (V): 1
- Eastern Plateau and Hills Region (VII): 1
- Central Plateau and Hills Region (VIII): 1
- The Islands Region (XV): 1

## Records by normalized_season
- YEAR_ROUND: 50
- MONSOON: 6
- SUMMER: 5
- WINTER: 4
- TRANSITIONAL: 1
- SPRING: 1
- AUTUMN: 1
- WET_SEASON: 1
- DRY_SEASON: 1

## Verification
- VERIFIED: 24
- PRIMARY_ONLY: 20
- SINGLE_SOURCE: 15
- PARTIALLY_CONFLICTING: 6
- PARTIALLY_VERIFIED: 3
- CONFLICTING_MINOR: 2
- Records with a secondary source listed: 37

## Source distribution (primary source type)
- ICAR research institute (government): 34
- University e-text (government e-learning programme): 15
- ICAR / KVK (government): 7
- Government publication: 4
- Established scientific society: 4
- National meteorological agency: 4
- Government research agency: 1
- District administration (government): 1

## Known gaps
- Indian states/UTs with no record: Andhra Pradesh, Telangana, Jammu & Kashmir, Ladakh, Delhi, Haryana, Chhattisgarh, Jharkhand, Goa, and Northeast states other than Assam (plus Sikkim, Meghalaya, etc.).
- Temperature: sourced only at Planning Commission region level (15 region records from one university e-text), for Gorakhpur's zone (ANDUAT study, 2004-2023 means) and for Khordha (maximum/minimum from ICAR-IIPR). No IMD district normals; frost/heat risk is rated only where a source states it (Western Himalayan frost, Western Dry heat).
- Zone-code conflicts (Jaipur/Ajmer, Shimla, Gorakhpur neighbours, Dehradun/Uttarakhand, Ahmedabad) were NOT resolved by reading full plans; only the Gorakhpur and Bhopal plans were read in full, the rest from search excerpts.
- Shimla still has no rainfall record (not in the plan excerpts retrieved). Pune rainfall comes from the district administration and IITM, not the ICAR plan.
- No Koppen-Geiger classes (no authoritative per-region source retrieved).
- Global coverage: UK, Australia, Singapore, USA only. No Mediterranean, continental, monsoonal East Asia, Africa, South America.
- Compass labels such as 'North India' are not in the sources and are not asserted.

## Limitations
- ICAR-CRIDA plans date from about 2011-2016; rainfall normals have unstated averaging periods and differ from other sources by period.
- Some plan values are garbled by PDF text extraction (coordinates); these were omitted.
- Zone codes are inconsistent between some plans (see audit notes: Gorakhpur neighbours, Jaipur/Ajmer, Shimla).
- Derived statements are prefixed DERIVED in seasonal_gardening_implications and are arithmetic or direct logic on sourced figures, not source claims.
