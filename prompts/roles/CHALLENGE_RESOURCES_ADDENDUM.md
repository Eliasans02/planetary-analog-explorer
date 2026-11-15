# RESOURCE-01 — official challenge resource integration

Status: PREPARED_NOT_DISPATCHED. Astra supplies this same immutable context to each role. Continue your assigned role only. Do not claim another role's work or native subagents unless actually available. The current loop is LOOP_0 PHASE_4; human Dev_A and Dev_B PASS remain absent.

[CONTEXT_HEADER]

Project: Planetary Analog Explorer. Repository root: `planetary-analog-explorer/`. Python 3.11+ source lives in `data-pipeline/`, React/Three.js source in `web-client/`. Full shared contracts and the resource manifest are embedded below. No application source is assumed to be available unless it actually exists in your developer session. If required source is absent, report that exact limitation; do not recreate it from a description.

The user pasted the complete Resources tab of:
https://www.spaceappschallenge.org/2026/challenges/permanent-moon-base-locations-and-mars/?tab=resources

It lists 11 resources. Membership evidence is user-provided page content; direct retrieval of that tab failed. Independent provider evidence is recorded separately. The challenge asks for new terrestrial analog candidates and characterization using open Earth, Moon and Mars data. Existing known sites are a baseline, not evidence of systematic discovery.

The initial scientific profile remains topography-only. The existing strict dataset schema is 1.0.0; do not add undeclared challenge-resource fields to it. Link challenge membership in a sidecar report to existing dataset source IDs. Existing API signatures include:

```python
# data-pipeline/src/pae_pipeline/sources.py
def load_manifest(path: pathlib.Path) -> dict[str, object]: ...
```

```typescript
import type { Location, LocationsDataset } from '@shared/types/analog-location';
export interface Viewport3DProps {
  selected: Location | null;
  dataset: LocationsDataset;
  onTargetSelected: (id: string) => void;
}
export function Viewport3D(props: Viewport3DProps): React.JSX.Element;
```

Required sidecar report contract (not a change to runtime scientific JSON):

```typescript
interface ResourceIntegrationReport {
  task_id: 'RESOURCE-01';
  role: string;
  contract_version: '1.0.0';
  input_bundle_sha256: string | null;
  execution_mode: string;
  links: {
    challenge_resource_id: string;
    dataset_source_id: string | null;
    relationship: 'direct_archive_product' | 'discovered_via_portal' | 'supplemental_mission_product' | 'research_only';
    relationship_evidence_urls: string[];
    product_id: string | null;
    product_url: string | null;
    raw_sha256: string | null;
    derived_sha256: string | null;
    usage: string[];
    status: 'research_only' | 'selected' | 'raw_acquired' | 'derived_verified' | 'runtime_verified';
    limitations: string[];
  }[];
  checks: { command: string; status: 'executed' | 'not_run'; exit_code: number | null; evidence: string }[];
  unverified: string[];
}
```

Exact output paths by role:
- Researcher: `reports/challenge_resource_selection.json`.
- Dev_A: `reports/challenge_source_lineage.json`; if actual code is available, minimal proposed changes to `data-pipeline/config/sites_manifest.json` and `data-pipeline/src/pae_pipeline/sources.py` only after concrete product/ROI inputs are verified.
- Dev_B: `reports/challenge_ui_source_usage.json`; source-attribution presentation proposals for `web-client/src/App.tsx` and `web-client/src/components/TelemetryHUD.tsx` against actual code. Preserve `Viewport3DProps` and lifecycle behavior.
- Code Reviewer: `reports/challenge_code_review.json`.
- Security Evaluator: `reports/challenge_security_review.json`.
- Requirements Manager: `reports/challenge_requirements_review.json`.
- Stitch: design-review text for Astra to save as `reports/challenge_design_review.md`, based on actual supplied screenshots/flow only.

[IMPLEMENTATION_SPEC]

Researcher selects exact products through the listed portals and documents access, quantity, units, spatial/temporal support, QA and license. Prioritize Earthdata and PDS/LRO for the first slice. Worldview is visual context, not a numerical raster. Keep Diviner thermal observations separate from POWER two-metre air temperature. SAR intensity is not an automatic terrain roughness or mineralogy measurement. Optional partner sources require an actual relevant product, not a decorative citation.

Dev_A must preserve provenance from a listed resource through a documented product relationship, real download hash, processing/QA, derived asset and feature use. Locally acquired LOLA Site04 files are real supplemental PGDA products; do not pretend their exact TIFF URLs appeared in the resource list. SRTM N19W156 CMR metadata is local, but its protected elevation ZIP is not. No guessed ROI, calibration, datum conversion or score. Preparation may fetch declared inputs with bounded retries; offline mode must reject all network calls. Keep original data licenses and notices.

Dev_B displays actual used products, quantities, dates and missingness. Catalogue references must not appear as acquired data. All runtime assets remain local; no portal API keys, remote imagery dependencies or added cloud SDK. Keep rendering caps, resource disposal, abort cleanup and worker shutdown. New source cards must not allocate geometry or trigger per-frame network requests. Do not claim NASA approval, eligibility or 60 FPS.

Reviewers require exact source/asset evidence; reports must distinguish inspected artifacts, generator claims and missing inputs. The requirements manager checks systematic candidate discovery outside a frozen sourced baseline and a declared searched domain. At least one listed NASA source must be demonstrated end to end before claiming compliance with the contemporary organizer guidance at https://github.com/nasa/spaceapps/discussions/1849 . That response has a general rule in another challenge discussion; it is not project certification.

Stitch reviews source readability, uncertainty and baseline-versus-discovery labels. Do not invent mission status, scores, coordinates, sensors, performance, endorsements or nonexistent dataset-loading actions.

[SELF_VERIFICATION_TEST]

Parse the report as strict JSON, resolve every challenge_resource_id against the embedded 11-entry manifest, reject invented hashes and verify every supplied hash against actual bytes. Confirm `runtime_verified` has real derived data and observed application evidence. `not_run` checks have null exit code. Test relevant changed source only; never manufacture science fixtures to unskip real-data integration. Verify scientific output against the unchanged full schema and cross-field rules. Report no full PASS or PHASE_5 advancement. If required source/credentials/data are absent, preserve that blocker while completing independent research.


[COMPLETE_CHALLENGE_RESOURCE_MANIFEST]
Exact file: docs/research/CHALLENGE_RESOURCES.json

````json
{
  "version": "1.0.0",
  "reviewed_on": "2026-11-14",
  "challenge_url": "https://www.spaceappschallenge.org/2026/challenges/permanent-moon-base-locations-and-mars/?tab=resources",
  "membership_evidence": "Complete Resources-tab text supplied by the user in this conversation. Direct challenge-page retrieval failed; provider verification is recorded separately.",
  "direct_challenge_tab_verified": false,
  "tracking_query_policy": "Preserve provided_url; remove only the supplied utm_source tracking parameter in canonical_url.",
  "scientific_payloads_acquired_by_this_update": false,
  "resources": [
    {
      "id": "challenge_nasa_earthdata_search",
      "agency": "NASA",
      "name": "NASA Earthdata Search",
      "provided_url": "https://search.earthdata.nasa.gov/?utm_source=%27chatgpt.com%27",
      "canonical_url": "https://search.earthdata.nasa.gov/",
      "kind": "discovery_portal",
      "priority": "first_vertical_slice",
      "pipeline_use": "Discover and record exact Earth DEM/albedo/land-surface products, collection version, granule, footprint, time, QA, datum and download URL. SRTMGL1 V003 N19W156 is an existing candidate; only its CMR metadata is local.",
      "frontend_use": "Offline source attribution and real derived terrain; no live portal calls during demo.",
      "existing_registry_ids": [
        "srtm",
        "modis_mcd43a3_061"
      ],
      "limitation": "A portal link or CMR metadata is not a downloaded scientific raster or evidence of feature use. Authenticated downloads remain offline preparation.",
      "primary_verification": {
        "status": "primary_portal_shell_fetched",
        "url": "https://search.earthdata.nasa.gov/",
        "resolved_url": "https://search.earthdata.nasa.gov/",
        "http_status": 200,
        "retrieved_at_utc": "2026-11-14T08:29:32.390740Z",
        "tls_verification": "enabled_default_trust_store",
        "retrieved_representation": "HTML page, not a scientific payload",
        "page_bytes": 14874,
        "page_sha256": "7de8b4d463ef95c1a6e36acee1b5adfd279f078a508fa3a55c0f5989eaf84bf9",
        "observed_links": [],
        "scope_limit": "JavaScript application shell reached; interactive search, layers and scientific payloads were not independently loaded.",
        "product_relationship": {
          "status": "portal_to_exact_product_relationship_verified_payload_pending",
          "listed_resource_id": "challenge_nasa_earthdata_search",
          "registry_id": "srtm",
          "collection_id": "C2763266360-LPCLOUD",
          "collection_short_name": "SRTMGL1",
          "collection_version": "003",
          "granule_id": "G2821072105-LPCLOUD",
          "granule_name": "N19W156.SRTMGL1.hgt",
          "portal_collection_url": "https://search.earthdata.nasa.gov/search/granules?p=C2763266360-LPCLOUD",
          "metadata_query_url": "https://cmr.earthdata.nasa.gov/search/granules.json?short_name=SRTMGL1&version=003&readable_granule_name=N19W156*&options%5Breadable_granule_name%5D%5Bpattern%5D=true&page_size=10",
          "granule_metadata_url": "https://cmr.earthdata.nasa.gov/search/concepts/G2821072105-LPCLOUD.umm_json",
          "download_url": "https://data.lpdaac.earthdatacloud.nasa.gov/lp-prod-protected/SRTMGL1.003/N19W156.SRTMGL1.hgt/N19W156.SRTMGL1.hgt.zip",
          "evidence": "The NASA CMR granule response provides the collection concept ID, an inherited Earthdata Search collection URL, and the exact HTTPS GET DATA ZIP URL. The cached UMM metadata independently contains that ZIP URL. This verifies a catalog relationship; no interactive portal click-through is claimed.",
          "local_metadata_path": "data-pipeline/cache/raw/fast-path/N19W156.cmr.json",
          "local_metadata_sha256": "e4be956132e2cedcb4dfe24c71db90fdaa98f1f3bf7025fb585712cc12fc9ed1",
          "local_metadata_bytes": 2672,
          "scientific_payload_downloaded": false,
          "feature_or_ui_use_verified": false,
          "download_blocker": "Protected LP DAAC payload requires documented Earthdata access. No authentication bypass, credential changes, or protected ZIP requests performed by this research update."
        }
      }
    },
    {
      "id": "challenge_nasa_worldview",
      "agency": "NASA",
      "name": "NASA Worldview",
      "provided_url": "https://worldview.earthdata.nasa.gov/index.html?utm_source=%27chatgpt.com%27",
      "canonical_url": "https://worldview.earthdata.nasa.gov/index.html",
      "kind": "visual_exploration",
      "priority": "research_context",
      "pipeline_use": "Inspect real candidate regions and layer/date/coverage context, then obtain original numerical products through their archives.",
      "frontend_use": "Only provenance-labelled locally prepared context imagery if redistribution terms permit.",
      "existing_registry_ids": [],
      "limitation": "Do not extract physical elevations, temperatures or scores from display colours or screenshots.",
      "primary_verification": {
        "status": "primary_portal_shell_fetched",
        "url": "https://worldview.earthdata.nasa.gov/index.html",
        "resolved_url": "https://worldview.earthdata.nasa.gov/index.html",
        "http_status": 200,
        "retrieved_at_utc": "2026-11-14T08:29:32.240129Z",
        "tls_verification": "enabled_default_trust_store",
        "retrieved_representation": "HTML page, not a scientific payload",
        "page_bytes": 4315,
        "page_sha256": "cb2d20917791e84f680004926944677e08289fa228d60fc734d427c0718596ff",
        "observed_links": [],
        "scope_limit": "JavaScript application shell reached; interactive search, layers and scientific payloads were not independently loaded."
      }
    },
    {
      "id": "challenge_nasa_pds",
      "agency": "NASA",
      "name": "NASA Planetary Data System (PDS)",
      "provided_url": "https://pds.nasa.gov/?utm_source=%27chatgpt.com%27",
      "canonical_url": "https://pds.nasa.gov/",
      "kind": "science_archive",
      "priority": "first_vertical_slice",
      "pipeline_use": "Resolve Moon/Mars products to exact archive identifiers and labels; preserve scale, offset, nodata, radius/areoid distinction and coordinate conventions.",
      "frontend_use": "Local terrain and metadata linked to actual downloaded PDS product identifiers.",
      "existing_registry_ids": [
        "lro_lola_gdr",
        "lro_diviner",
        "mgs_mola_megdr",
        "mro_hirise_jezero_candidate_dtm"
      ],
      "limitation": "Being a mission-associated dataset is not proof that a particular supplemental download is the identical PDS product. Record the actual relationship.",
      "primary_verification": {
        "status": "primary_page_fetched",
        "url": "https://pds.nasa.gov/",
        "resolved_url": "https://pds.nasa.gov/",
        "http_status": 200,
        "retrieved_at_utc": "2026-11-14T08:29:32.102850Z",
        "tls_verification": "enabled_default_trust_store",
        "retrieved_representation": "HTML page, not a scientific payload",
        "page_bytes": 61709,
        "page_sha256": "4884b4bb15904c6e7efcfa95cf2aea994b8850106898ccb5ef06606a5365bf68",
        "observed_links": [
          {
            "href": "http://pds-geosciences.wustl.edu/",
            "label": "Geosciences (GEO)"
          }
        ],
        "links_scope": "Selected observed links relevant to PAE, not a complete link inventory."
      }
    },
    {
      "id": "challenge_nasa_lro",
      "agency": "NASA",
      "name": "NASA Lunar Reconnaissance Orbiter (LRO)",
      "provided_url": "https://pds-geosciences.wustl.edu/missions/lro/?utm_source=%27chatgpt.com%27",
      "canonical_url": "https://pds-geosciences.wustl.edu/missions/lro/",
      "kind": "mission_archive",
      "priority": "first_vertical_slice",
      "pipeline_use": "Prioritize labelled LOLA topography and relevant LRO product metadata. Treat locally downloaded PGDA Site04 products as supplemental LOLA products until the archive relationship is documented.",
      "frontend_use": "Metric terrain from the accepted DEM and its actual reference frame; no relabelling MOON_ME/DE421 as another frame.",
      "existing_registry_ids": [
        "lro_lola_gdr",
        "lro_lola_south_pole_5m",
        "lro_diviner"
      ],
      "limitation": "A crater name or LRO mission label is not a verified landing coordinate or NASA-approved base site.",
      "primary_verification": {
        "status": "primary_page_fetched",
        "url": "https://pds-geosciences.wustl.edu/missions/lro/",
        "resolved_url": "https://pds-geosciences.wustl.edu/missions/lro/",
        "http_status": 200,
        "retrieved_at_utc": "2026-11-14T08:29:32.612835Z",
        "tls_verification": "enabled_default_trust_store",
        "retrieved_representation": "HTML page, not a scientific payload",
        "page_bytes": 51571,
        "page_sha256": "56abffacf69d6090862324c06270f3cb38ca9aedd6d9ba9850cbeabc1d3648b5",
        "observed_links": [
          {
            "href": "https://pds-geosciences.wustl.edu/missions/lro/diviner.htm",
            "label": "Diviner Archive"
          },
          {
            "href": "https://pds-geosciences.wustl.edu/missions/lro/lola.htm",
            "label": "LOLA Archive"
          }
        ],
        "links_scope": "Selected observed links relevant to PAE, not a complete link inventory.",
        "product_relationship": {
          "status": "instrument_archive_chain_verified_selected_pgda_product_is_supplemental",
          "listed_resource_id": "challenge_nasa_lro",
          "registry_ids": [
            "lro_lola_gdr",
            "lro_lola_south_pole_5m"
          ],
          "observed_edges": [
            {
              "from": "https://pds-geosciences.wustl.edu/missions/lro/",
              "to": "https://pds-geosciences.wustl.edu/missions/lro/lola.htm",
              "evidence": "Direct LOLA Archive link in fetched mission page."
            },
            {
              "from": "https://pds-geosciences.wustl.edu/missions/lro/lola.htm",
              "to": "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/",
              "evidence": "Direct gridded-record archive link in fetched instrument page."
            },
            {
              "from": "https://pds-geosciences.wustl.edu/missions/lro/lola.htm",
              "to": "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/catalog/gdr_ds.cat",
              "evidence": "Direct GDR dataset-description link in fetched instrument page."
            },
            {
              "from": "https://pds-geosciences.wustl.edu/missions/lro/lola.htm",
              "to": "https://science.nasa.gov/mission/lro/lola/",
              "evidence": "Direct NASA instrument-team link in fetched archive page."
            },
            {
              "from": "https://science.nasa.gov/mission/lro/lola/",
              "to": "https://science.nasa.gov/mission/lro/data-products/",
              "evidence": "Direct data-products link in fetched NASA instrument page."
            }
          ],
          "selected_supplemental_product_url": "https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site04/Site04_final_adj_5mpp_surf.tif",
          "supplemental_readme_url": "https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/README",
          "local_acquisition_evidence": "docs/research/acquisition_status.json",
          "selected_scientific_payload_downloaded": true,
          "selected_pgda_product_directly_linked_from_fetched_pds_pages": false,
          "selected_pgda_product_identical_to_a_pds_granule_verified": false,
          "scope_limit": "The observed chain establishes the LRO/LOLA instrument archive. It does not establish that the acquired PGDA Site04 supplemental TIFF is an identical archived PDS granule or an individually named challenge resource.",
          "feature_or_ui_use_verified": false
        }
      }
    },
    {
      "id": "challenge_nasa_diviner",
      "agency": "NASA",
      "name": "NASA LRO Diviner Lunar Data",
      "provided_url": "https://pds-geosciences.wustl.edu/missions/lro/diviner.htm?utm_source=%27chatgpt.com%27",
      "canonical_url": "https://pds-geosciences.wustl.edu/missions/lro/diviner.htm",
      "kind": "instrument_archive",
      "priority": "thermal_context_after_topography",
      "pipeline_use": "Read documented surface-temperature quantity, time sampling, extrema definition, resolution and QA before choosing a lunar polar product.",
      "frontend_use": "Display sourced thermal context and missingness separately from the topography-only similarity profile.",
      "existing_registry_ids": [
        "lro_diviner"
      ],
      "limitation": "POWER two-metre air temperature is not a directly comparable Earth surface-temperature observable. No cross-body thermal score without a matched definition.",
      "primary_verification": {
        "status": "primary_page_fetched",
        "url": "https://pds-geosciences.wustl.edu/missions/lro/diviner.htm",
        "resolved_url": "https://pds-geosciences.wustl.edu/missions/lro/diviner.htm",
        "http_status": 200,
        "retrieved_at_utc": "2026-11-14T08:29:32.412123Z",
        "tls_verification": "enabled_default_trust_store",
        "retrieved_representation": "HTML page, not a scientific payload",
        "page_bytes": 39498,
        "page_sha256": "89f3c4412e549df606f682da98c62fea94f1dd17a4543e5a0f661c354d883cb6",
        "observed_links": [
          {
            "href": "https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_gdr_l2/",
            "label": "GDR_L2"
          },
          {
            "href": "https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_gdr_l3/",
            "label": "GDR_L3"
          },
          {
            "href": "https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_pcp/",
            "label": "PCP - Polar Cumulative Products"
          },
          {
            "href": "https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/",
            "label": "PRP - Polar Resource Products"
          }
        ],
        "links_scope": "Selected observed links relevant to PAE, not a complete link inventory."
      }
    },
    {
      "id": "challenge_csa_rcm",
      "agency": "CSA",
      "name": "RADARSAT Constellation Mission (RCM) - Data",
      "provided_url": "https://donnees-data.asc-csa.gc.ca/en/dataset/rcm",
      "canonical_url": "https://donnees-data.asc-csa.gc.ca/en/dataset/rcm",
      "kind": "sar_archive",
      "priority": "optional_after_vertical_slice",
      "pipeline_use": "Evaluate actual publicly accessible SAR scenes over a chosen candidate; preserve product calibration, polarization, geometry, date and processing history.",
      "frontend_use": "Optional offline context layer, with quantity and uncertainty disclosed.",
      "existing_registry_ids": [],
      "limitation": "Public access covers only some RCM products, needs EODMS registration and product-specific terms. SAR intensity must not be silently relabelled DEM slope, mineralogy or terrain roughness.",
      "primary_verification": {
        "status": "official_access_documentation_verified_catalog_fetch_timed_out",
        "url": "https://www.asc-csa.gc.ca/eng/satellites/radarsat/access-to-data/about.asp"
      }
    },
    {
      "id": "challenge_csa_radarsat1",
      "agency": "CSA",
      "name": "RADARSAT 1 - Data",
      "provided_url": "https://donnees-data.asc-csa.gc.ca/en/dataset/radarsat1",
      "canonical_url": "https://donnees-data.asc-csa.gc.ca/en/dataset/radarsat1",
      "kind": "sar_archive",
      "priority": "optional_after_vertical_slice",
      "pipeline_use": "Prefer this openly licensed archive when an appropriate historical scene supports a documented research question; choose a real scene rather than assuming coverage.",
      "frontend_use": "Optional local SAR context with actual acquisition date and source credit.",
      "existing_registry_ids": [],
      "limitation": "Archive availability alone does not establish a suitable scene or a calibrated geophysical feature. Preserve Open Government Licence - Canada notices.",
      "primary_verification": {
        "status": "official_indexed_catalog_and_access_documentation_verified",
        "url": "https://www.csa-asc.gc.ca/eng/satellites/radarsat1/data-access.asp"
      }
    },
    {
      "id": "challenge_csa_sar_tutorial",
      "agency": "CSA",
      "name": "Synthetic Aperture Radar (SAR) Python Tutorial",
      "provided_url": "https://github.com/asc-csa/Synthetic_Aperture_Radar_Tutorial",
      "canonical_url": "https://github.com/asc-csa/Synthetic_Aperture_Radar_Tutorial",
      "kind": "code_tutorial",
      "priority": "research_reference",
      "pipeline_use": "Use the Python/QGIS raster handling workflow as a learning reference. Inspect exact code and its license before copying; no tutorial code has been copied or executed by this update.",
      "frontend_use": "None directly; this is processing guidance, not a browser renderer or science dataset.",
      "existing_registry_ids": [],
      "limitation": "Its British Columbia fire example is not a validated planetary analog; plotting SAR is not an analog-scoring algorithm.",
      "primary_verification": {
        "status": "repository_readme_verified_license_page_opened",
        "url": "https://github.com/asc-csa/Synthetic_Aperture_Radar_Tutorial",
        "license_url": "https://github.com/asc-csa/Synthetic_Aperture_Radar_Tutorial/blob/main/LICENSE"
      }
    },
    {
      "id": "challenge_esa_copernicus",
      "agency": "ESA",
      "name": "Copernicus Data Space Ecosystem",
      "provided_url": "https://dataspace.copernicus.eu/?utm_source=%27chatgpt.com%27",
      "canonical_url": "https://dataspace.copernicus.eu/",
      "kind": "discovery_and_processing_portal",
      "priority": "candidate_context_after_topography",
      "pipeline_use": "Investigate Sentinel imagery for candidate context and QA through documented catalogue/download interfaces; record exact product, bands, scaling, masks and date.",
      "frontend_use": "Optional prepared local imagery or derived context; no runtime cloud service or credentials.",
      "existing_registry_ids": [],
      "limitation": "Portal access does not mean all services or quotas are unlimited; do not infer basalt or mineral fractions from an unvalidated colour composite.",
      "primary_verification": {
        "status": "portal_and_api_overview_verified",
        "url": "https://dataspace.copernicus.eu/analyse/apis"
      }
    },
    {
      "id": "challenge_esa_open_science",
      "agency": "ESA",
      "name": "ESA Open Science Catalog",
      "provided_url": "https://opensciencedata.esa.int/?utm_source=%27chatgpt.com%27",
      "canonical_url": "https://opensciencedata.esa.int/",
      "kind": "research_catalogue",
      "priority": "research_reference",
      "pipeline_use": "Find candidate geoscience datasets and documented workflows; vet individual products before adding an adapter.",
      "frontend_use": "Only actual selected products appear as used sources.",
      "existing_registry_ids": [],
      "limitation": "Catalogue is not itself a homogeneous raster product or blanket license. No product selected.",
      "primary_verification": {
        "status": "page_reached_no_readable_catalogue_content",
        "url": "https://opensciencedata.esa.int/"
      }
    },
    {
      "id": "challenge_jaxa_gportal",
      "agency": "JAXA",
      "name": "JAXA G-Portal",
      "provided_url": "https://gportal.jaxa.jp/gpr/index/index?utm_source=%27chatgpt.com%27",
      "canonical_url": "https://gportal.jaxa.jp/gpr/index/index",
      "kind": "earth_observation_portal",
      "priority": "environment_context_after_topography",
      "pipeline_use": "Explore documented physical-quantity and spacecraft searches for environmental context; select a product/version/QA/time window before use.",
      "frontend_use": "Only real preprocessed environmental summaries with source metadata and comparable support.",
      "existing_registry_ids": [],
      "limitation": "A portal category is not an available measurement at a candidate polygon. Do not infer aridity from humidity or a single precipitation value.",
      "primary_verification": {
        "status": "portal_and_product_navigation_verified",
        "resolved_url": "https://www.gportal.jaxa.jp/?lang=en",
        "url": "https://www.gportal.jaxa.jp/information/product?lang=en"
      }
    }
  ],
  "supplemental_sources": [
    "NASA POWER",
    "ISRIC SoilGrids",
    "PGC ArcticDEM/REMA",
    "NASA PGDA LOLA Site04"
  ],
  "supplemental_policy": "These existing project sources are not individually named in the supplied resource list. Record their actual relationship to listed portals or missions; do not claim direct listing. Keep scientifically useful supplemental sources and their own attribution.",
  "acceptance": {
    "traceability_chain": [
      "listed_resource_id",
      "actual_product_identifier_and_url",
      "raw_local_sha256",
      "processing_and_quality_evidence",
      "derived_artifact_sha256",
      "feature_or_ui_use"
    ],
    "at_least_one_listed_nasa_source_used": "NOT_YET_DEMONSTRATED_END_TO_END",
    "organizer_guidance_url": "https://github.com/nasa/spaceapps/discussions/1849",
    "guidance_context": "2026-11-06 GO Team response in another challenge discussion states a general minimum of one listed NASA data source for Global Awards. Recorded as organizer guidance, not an eligibility certification.",
    "known_sites_role": "Documented baseline and validation; discovery must also evaluate candidates outside that baseline within an explicit searched domain.",
    "human_pass_dev_a": false,
    "human_pass_dev_b": false
  }
}

````


[COMPLETE_SHARED_TYPES]
Exact file: shared/types/analog-location.ts

````typescript
/** Contract 1.0.0. Validate numeric bounds and cross-field invariants at runtime.
 * Heightmap invalid samples contain float 0 and mask 0; 0 is not a missing sentinel.
 */
export type Body = "earth" | "moon" | "mars";
export type FeatureKey =
  | "slope_mean_deg" | "slope_max_deg" | "roughness_index"
  | "elevation_delta_m" | "temp_min_c" | "temp_max_c"
  | "solar_irradiance_kwh_m2" | "aridity_index" | "albedo";
export type FeatureUnit = "deg" | "1" | "m" | "degC" | "kWh/m2/day";
export type Vec3 = [number, number, number];
export type Mat4 = [number, number, number, number, number, number, number, number,
  number, number, number, number, number, number, number, number];
export type LocalFrame = "local_enu_x_east_y_up_z_south";
export interface Source {
  id: string; provider: string; product_id: string; product_url: string;
  mission: string | null; access_url: string; retrieved_at: string;
  sha256: string; license: string; local_path: string;
}
export interface ObservationPeriod { start: string; end: string }
interface FeatureMetadata<U extends FeatureUnit> {
  unit: U; quantity: string; method: string;
  spatial_resolution_m: number | null; support_window_m: number | null;
  period: ObservationPeriod | null;
}
export type Feature<U extends FeatureUnit = FeatureUnit> = FeatureMetadata<U> & (
  | { value: number; source_ids: [string, ...string[]]; missing_reason: null }
  | { value: null; source_ids: string[]; missing_reason: string }
);
export interface Features {
  slope_mean_deg: Feature<"deg">; slope_max_deg: Feature<"deg">;
  roughness_index: Feature<"1">; elevation_delta_m: Feature<"m">;
  temp_min_c: Feature<"degC">; temp_max_c: Feature<"degC">;
  solar_irradiance_kwh_m2: Feature<"kWh/m2/day">;
  aridity_index: Feature<"1">; albedo: Feature<"1">;
}
export type CoordinateFrame = "earth_wgs84" | "moon_iau_planetocentric" | "mars_iau_planetocentric";
export interface Coordinates {
  latitude_deg: number; longitude_deg: number; frame: CoordinateFrame;
  source_ids: [string, ...string[]];
}
export interface AreaOfInterest { local_path: string; source_ids: [string, ...string[]] }
export interface Asset {
  path: string; sha256: string; bytes: number; source_ids: [string, ...string[]];
}
export interface Heightmap {
  asset: Asset; valid_mask: Asset; width: number; height: number;
  encoding: "float32_le"; nodata: null;
  row_order: "north_to_south"; col_order: "west_to_east"; samples: "grid_nodes";
  height_reference: "offset_from_origin_elevation_m";
  extent_m: [number, number, number, number];
  origin: { latitude_deg: number; longitude_deg: number; elevation_m: number };
  frame: LocalFrame; vertical_datum: string; meters_per_unit: 1;
}
export interface Splat {
  asset: Asset; format: "splat" | "ply"; gaussian_count: number;
  scale_is_metric: boolean; world_from_asset: Mat4; reconstruction_method: string;
  geometry_provenance: "photogrammetric" | "inferred";
}
export interface Camera {
  position: Vec3; lookAt: Vec3; frame: LocalFrame; fov: number; near: number; far: number;
}
export type Geology =
  | { classes: [string, ...string[]]; method: string; source_ids: [string, ...string[]]; missing_reason: null }
  | { classes: []; method: string; source_ids: string[]; missing_reason: string };
export interface Location<B extends Body = Body> {
  id: string; name: string; body: B; coordinates: Coordinates;
  aoi: AreaOfInterest; missions: string[];
  features: Features; geology: Geology;
  assets: { dem: Asset | null; heightmap: Heightmap | null; splat: Splat | null };
  camera: Camera | null;
}
export type FeatureBreakdown =
  | { similarity_pct: number; squared_distance_contribution: number; reason: null }
  | { similarity_pct: null; squared_distance_contribution: null; reason: string };
export interface Analog {
  location: Location<"earth">; similarity_score: number; rank: 1 | 2 | 3;
  breakdown: Record<FeatureKey, FeatureBreakdown>; coverage: number;
}
export interface Excluded { location_id: string; reasons: [string, ...string[]] }
type ProfileFeatureBase<K extends FeatureKey, U extends FeatureUnit> = {
  key: K; unit: U; quantity: string; weight: number; lower: number; upper: number;
  calibration_source_ids: [string, ...string[]]; calibration_method: string;
};
export type ProfileFeature =
  | ProfileFeatureBase<"slope_mean_deg" | "slope_max_deg", "deg">
  | ProfileFeatureBase<"elevation_delta_m", "m">
  | ProfileFeatureBase<"temp_min_c" | "temp_max_c", "degC">
  | ProfileFeatureBase<"solar_irradiance_kwh_m2", "kWh/m2/day">
  | ProfileFeatureBase<"roughness_index" | "aridity_index" | "albedo", "1">;
export interface ScoringProfile {
  id: string; version: string; algorithm: "weighted_cosine_euclidean_v1";
  alpha: number; features: [ProfileFeature, ...ProfileFeature[]];
  comparison_resolution_m: number; window_m: number; min_valid_area_fraction: number;
}
export interface Comparison {
  target: Location<"moon" | "mars">; profile_id: string;
  analogs: Analog[]; excluded: Excluded[];
}
export interface LocationsDataset {
  schema_version: "1.0.0"; generated_at: string;
  sources: Source[]; profiles: ScoringProfile[]; comparisons: Comparison[];
}

````


[COMPLETE_DATASET_SCHEMA]
Exact file: shared/schemas/analog_location.schema.json

````json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:pae:schema:analog-location:1.0.0",
  "title": "Planetary Analog Explorer locations dataset",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema_version","generated_at","sources","profiles","comparisons"],
  "properties": {"schema_version":{"const":"1.0.0"},"generated_at":{"type":"string","format":"date-time"},"sources":{"type":"array","items":{"$ref":"#/$defs/source"}},"profiles":{"type":"array","items":{"$ref":"#/$defs/scoringProfile"}},"comparisons":{"type":"array","items":{"$ref":"#/$defs/comparison"}}},
  "$defs": {
    "source": {"type":"object","additionalProperties":false,"required":["id","provider","product_id","product_url","mission","access_url","retrieved_at","sha256","license","local_path"],"properties":{"id":{"type":"string","minLength":1},"provider":{"type":"string","minLength":1},"product_id":{"type":"string","minLength":1},"product_url":{"type":"string","format":"uri","pattern":"^https://"},"mission":{"type":["string","null"],"minLength":1},"access_url":{"type":"string","format":"uri","pattern":"^https://"},"retrieved_at":{"type":"string","format":"date-time"},"sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"license":{"type":"string","minLength":1},"local_path":{"type":"string","pattern":"^(?!/)(?!.*(?:^|/)\\.{1,2}(?:/|$))[A-Za-z0-9_./-]+$"}}},
    "period": {"type":"object","additionalProperties":false,"required":["start","end"],"properties":{"start":{"type":"string","format":"date-time"},"end":{"type":"string","format":"date-time"}}},
    "feature": {"type":"object","additionalProperties":false,"required":["value","unit","quantity","method","spatial_resolution_m","support_window_m","period","source_ids","missing_reason"],"properties":{"value":{"type":["number","null"]},"unit":{"enum":["deg","1","m","degC","kWh/m2/day"]},"quantity":{"type":"string","minLength":1},"method":{"type":"string","minLength":1},"spatial_resolution_m":{"type":["number","null"],"exclusiveMinimum":0},"support_window_m":{"type":["number","null"],"exclusiveMinimum":0},"period":{"anyOf":[{"$ref":"#/$defs/period"},{"type":"null"}]},"source_ids":{"type":"array","items":{"type":"string","minLength":1},"uniqueItems":true},"missing_reason":{"type":["string","null"],"minLength":1}},"allOf":[{"if":{"properties":{"value":{"type":"number"}}},"then":{"properties":{"source_ids":{"type":"array","items":{"type":"string","minLength":1},"uniqueItems":true,"minItems":1},"missing_reason":{"type":"null"}}},"else":{"properties":{"missing_reason":{"type":"string","minLength":1}}}}]},
    "features": {"type":"object","additionalProperties":false,"required":["slope_mean_deg","slope_max_deg","roughness_index","elevation_delta_m","temp_min_c","temp_max_c","solar_irradiance_kwh_m2","aridity_index","albedo"],"properties":{"slope_mean_deg":{"allOf":[{"$ref":"#/$defs/feature"},{"properties":{"unit":{"const":"deg"},"value":{"type":["number","null"],"minimum":0,"maximum":90}}}]},"slope_max_deg":{"allOf":[{"$ref":"#/$defs/feature"},{"properties":{"unit":{"const":"deg"},"value":{"type":["number","null"],"minimum":0,"maximum":90}}}]},"roughness_index":{"allOf":[{"$ref":"#/$defs/feature"},{"properties":{"unit":{"const":"1"},"value":{"type":["number","null"],"minimum":0}}}]},"elevation_delta_m":{"allOf":[{"$ref":"#/$defs/feature"},{"properties":{"unit":{"const":"m"},"value":{"type":["number","null"],"minimum":0}}}]},"temp_min_c":{"allOf":[{"$ref":"#/$defs/feature"},{"properties":{"unit":{"const":"degC"},"value":{"type":["number","null"],"minimum":-273.15}}}]},"temp_max_c":{"allOf":[{"$ref":"#/$defs/feature"},{"properties":{"unit":{"const":"degC"},"value":{"type":["number","null"],"minimum":-273.15}}}]},"solar_irradiance_kwh_m2":{"allOf":[{"$ref":"#/$defs/feature"},{"properties":{"unit":{"const":"kWh/m2/day"},"value":{"type":["number","null"],"minimum":0}}}]},"aridity_index":{"allOf":[{"$ref":"#/$defs/feature"},{"properties":{"unit":{"const":"1"},"value":{"type":["number","null"],"minimum":0}}}]},"albedo":{"allOf":[{"$ref":"#/$defs/feature"},{"properties":{"unit":{"const":"1"},"value":{"type":["number","null"],"minimum":0,"maximum":1}}}]}}},
    "coordinates": {"type":"object","additionalProperties":false,"required":["latitude_deg","longitude_deg","frame","source_ids"],"properties":{"latitude_deg":{"type":"number","minimum":-90,"maximum":90},"longitude_deg":{"type":"number","minimum":-180,"maximum":180},"frame":{"enum":["earth_wgs84","moon_iau_planetocentric","mars_iau_planetocentric"]},"source_ids":{"type":"array","items":{"type":"string","minLength":1},"uniqueItems":true,"minItems":1}}},
    "asset": {"type":"object","additionalProperties":false,"required":["path","sha256","bytes","source_ids"],"properties":{"path":{"type":"string","pattern":"^/assets/(?!\\.{1,2}(?:/|$))(?!.*\\/\\.{1,2}(?:/|$))[A-Za-z0-9_./-]+$"},"sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"bytes":{"type":"integer","minimum":1},"source_ids":{"type":"array","items":{"type":"string","minLength":1},"uniqueItems":true,"minItems":1}}},
    "heightmap": {"type":"object","additionalProperties":false,"required":["asset","valid_mask","width","height","encoding","nodata","row_order","col_order","samples","height_reference","extent_m","origin","frame","vertical_datum","meters_per_unit"],"properties":{"asset":{"$ref":"#/$defs/asset"},"valid_mask":{"$ref":"#/$defs/asset"},"width":{"type":"integer","minimum":2},"height":{"type":"integer","minimum":2},"encoding":{"const":"float32_le"},"nodata":{"type":"null"},"row_order":{"const":"north_to_south"},"col_order":{"const":"west_to_east"},"samples":{"const":"grid_nodes"},"height_reference":{"const":"offset_from_origin_elevation_m"},"extent_m":{"type":"array","items":{"type":"number"},"minItems":4,"maxItems":4},"origin":{"type":"object","additionalProperties":false,"required":["latitude_deg","longitude_deg","elevation_m"],"properties":{"latitude_deg":{"type":"number","minimum":-90,"maximum":90},"longitude_deg":{"type":"number","minimum":-180,"maximum":180},"elevation_m":{"type":"number"}}},"frame":{"const":"local_enu_x_east_y_up_z_south"},"vertical_datum":{"type":"string","minLength":1},"meters_per_unit":{"const":1}}},
    "splat": {"type":"object","additionalProperties":false,"required":["asset","format","gaussian_count","scale_is_metric","world_from_asset","reconstruction_method","geometry_provenance"],"properties":{"asset":{"$ref":"#/$defs/asset"},"format":{"enum":["splat","ply"]},"gaussian_count":{"type":"integer","minimum":1},"scale_is_metric":{"type":"boolean"},"world_from_asset":{"type":"array","items":{"type":"number"},"minItems":16,"maxItems":16},"reconstruction_method":{"type":"string","minLength":1},"geometry_provenance":{"enum":["photogrammetric","inferred"]}}},
    "camera": {"type":"object","additionalProperties":false,"required":["position","lookAt","frame","fov","near","far"],"properties":{"position":{"type":"array","items":{"type":"number"},"minItems":3,"maxItems":3},"lookAt":{"type":"array","items":{"type":"number"},"minItems":3,"maxItems":3},"frame":{"const":"local_enu_x_east_y_up_z_south"},"fov":{"type":"number","exclusiveMinimum":0,"exclusiveMaximum":180},"near":{"type":"number","exclusiveMinimum":0},"far":{"type":"number","exclusiveMinimum":0}}},
    "geology": {"type":"object","additionalProperties":false,"required":["classes","method","source_ids","missing_reason"],"properties":{"classes":{"type":"array","items":{"type":"string","minLength":1},"uniqueItems":true},"method":{"type":"string","minLength":1},"source_ids":{"type":"array","items":{"type":"string","minLength":1},"uniqueItems":true},"missing_reason":{"type":["string","null"],"minLength":1}},"allOf":[{"if":{"properties":{"classes":{"minItems":1}}},"then":{"properties":{"source_ids":{"type":"array","items":{"type":"string","minLength":1},"uniqueItems":true,"minItems":1},"missing_reason":{"type":"null"}}},"else":{"properties":{"missing_reason":{"type":"string","minLength":1}}}}]},
    "location": {"type":"object","additionalProperties":false,"required":["id","name","body","coordinates","aoi","missions","features","geology","assets","camera"],"properties":{"id":{"type":"string","minLength":1},"name":{"type":"string","minLength":1},"body":{"enum":["earth","moon","mars"]},"coordinates":{"$ref":"#/$defs/coordinates"},"aoi":{"type":"object","additionalProperties":false,"required":["local_path","source_ids"],"properties":{"local_path":{"type":"string","pattern":"^/assets/(?!\\.{1,2}(?:/|$))(?!.*\\/\\.{1,2}(?:/|$))[A-Za-z0-9_./-]+$"},"source_ids":{"type":"array","items":{"type":"string","minLength":1},"uniqueItems":true,"minItems":1}}},"missions":{"type":"array","items":{"type":"string","minLength":1},"uniqueItems":true},"features":{"$ref":"#/$defs/features"},"geology":{"$ref":"#/$defs/geology"},"assets":{"type":"object","additionalProperties":false,"required":["dem","heightmap","splat"],"properties":{"dem":{"anyOf":[{"$ref":"#/$defs/asset"},{"type":"null"}]},"heightmap":{"anyOf":[{"$ref":"#/$defs/heightmap"},{"type":"null"}]},"splat":{"anyOf":[{"$ref":"#/$defs/splat"},{"type":"null"}]}}},"camera":{"anyOf":[{"$ref":"#/$defs/camera"},{"type":"null"}]}},"allOf":[{"if":{"properties":{"body":{"const":"earth"}}},"then":{"properties":{"coordinates":{"properties":{"frame":{"const":"earth_wgs84"}}}}}},{"if":{"properties":{"body":{"const":"moon"}}},"then":{"properties":{"coordinates":{"properties":{"frame":{"const":"moon_iau_planetocentric"}}}}}},{"if":{"properties":{"body":{"const":"mars"}}},"then":{"properties":{"coordinates":{"properties":{"frame":{"const":"mars_iau_planetocentric"}}}}}}]},
    "featureBreakdown": {"type":"object","additionalProperties":false,"required":["similarity_pct","squared_distance_contribution","reason"],"properties":{"similarity_pct":{"type":["number","null"],"minimum":0,"maximum":100},"squared_distance_contribution":{"type":["number","null"],"minimum":0,"maximum":1},"reason":{"type":["string","null"],"minLength":1}},"allOf":[{"if":{"properties":{"similarity_pct":{"type":"number"}}},"then":{"properties":{"squared_distance_contribution":{"type":"number","minimum":0,"maximum":1},"reason":{"type":"null"}}},"else":{"properties":{"squared_distance_contribution":{"type":"null"},"reason":{"type":"string","minLength":1}}}}]},
    "breakdown": {"type":"object","additionalProperties":false,"required":["slope_mean_deg","slope_max_deg","roughness_index","elevation_delta_m","temp_min_c","temp_max_c","solar_irradiance_kwh_m2","aridity_index","albedo"],"properties":{"slope_mean_deg":{"$ref":"#/$defs/featureBreakdown"},"slope_max_deg":{"$ref":"#/$defs/featureBreakdown"},"roughness_index":{"$ref":"#/$defs/featureBreakdown"},"elevation_delta_m":{"$ref":"#/$defs/featureBreakdown"},"temp_min_c":{"$ref":"#/$defs/featureBreakdown"},"temp_max_c":{"$ref":"#/$defs/featureBreakdown"},"solar_irradiance_kwh_m2":{"$ref":"#/$defs/featureBreakdown"},"aridity_index":{"$ref":"#/$defs/featureBreakdown"},"albedo":{"$ref":"#/$defs/featureBreakdown"}}},
    "analog": {"type":"object","additionalProperties":false,"required":["location","similarity_score","rank","breakdown","coverage"],"properties":{"location":{"allOf":[{"$ref":"#/$defs/location"},{"properties":{"body":{"const":"earth"}}}]},"similarity_score":{"type":"number","minimum":0,"maximum":100},"rank":{"type":"integer","minimum":1,"maximum":3},"breakdown":{"$ref":"#/$defs/breakdown"},"coverage":{"type":"number","minimum":0,"maximum":1}}},
    "excluded": {"type":"object","additionalProperties":false,"required":["location_id","reasons"],"properties":{"location_id":{"type":"string","minLength":1},"reasons":{"type":"array","items":{"type":"string","minLength":1},"uniqueItems":true,"minItems":1}}},
    "profileFeature": {"type":"object","additionalProperties":false,"required":["key","unit","quantity","weight","lower","upper","calibration_source_ids","calibration_method"],"properties":{"key":{"enum":["slope_mean_deg","slope_max_deg","roughness_index","elevation_delta_m","temp_min_c","temp_max_c","solar_irradiance_kwh_m2","aridity_index","albedo"]},"unit":{"enum":["deg","1","m","degC","kWh/m2/day"]},"quantity":{"type":"string","minLength":1},"weight":{"type":"number","exclusiveMinimum":0},"lower":{"type":"number"},"upper":{"type":"number"},"calibration_source_ids":{"type":"array","items":{"type":"string","minLength":1},"uniqueItems":true,"minItems":1},"calibration_method":{"type":"string","minLength":1}},"allOf":[{"if":{"properties":{"key":{"const":"slope_mean_deg"}}},"then":{"properties":{"unit":{"const":"deg"}}}},{"if":{"properties":{"key":{"const":"slope_max_deg"}}},"then":{"properties":{"unit":{"const":"deg"}}}},{"if":{"properties":{"key":{"const":"roughness_index"}}},"then":{"properties":{"unit":{"const":"1"}}}},{"if":{"properties":{"key":{"const":"elevation_delta_m"}}},"then":{"properties":{"unit":{"const":"m"}}}},{"if":{"properties":{"key":{"const":"temp_min_c"}}},"then":{"properties":{"unit":{"const":"degC"}}}},{"if":{"properties":{"key":{"const":"temp_max_c"}}},"then":{"properties":{"unit":{"const":"degC"}}}},{"if":{"properties":{"key":{"const":"solar_irradiance_kwh_m2"}}},"then":{"properties":{"unit":{"const":"kWh/m2/day"}}}},{"if":{"properties":{"key":{"const":"aridity_index"}}},"then":{"properties":{"unit":{"const":"1"}}}},{"if":{"properties":{"key":{"const":"albedo"}}},"then":{"properties":{"unit":{"const":"1"}}}}]},
    "scoringProfile": {"type":"object","additionalProperties":false,"required":["id","version","algorithm","alpha","features","comparison_resolution_m","window_m","min_valid_area_fraction"],"properties":{"id":{"type":"string","minLength":1},"version":{"type":"string","minLength":1},"algorithm":{"const":"weighted_cosine_euclidean_v1"},"alpha":{"type":"number","minimum":0,"maximum":1},"features":{"type":"array","items":{"$ref":"#/$defs/profileFeature"},"minItems":1,"maxItems":9,"uniqueItems":true},"comparison_resolution_m":{"type":"number","exclusiveMinimum":0},"window_m":{"type":"number","exclusiveMinimum":0},"min_valid_area_fraction":{"type":"number","exclusiveMinimum":0,"maximum":1}}},
    "comparison": {"type":"object","additionalProperties":false,"required":["target","profile_id","analogs","excluded"],"properties":{"target":{"allOf":[{"$ref":"#/$defs/location"},{"properties":{"body":{"enum":["moon","mars"]}}}]},"profile_id":{"type":"string","minLength":1},"analogs":{"type":"array","items":{"$ref":"#/$defs/analog"},"maxItems":3},"excluded":{"type":"array","items":{"$ref":"#/$defs/excluded"}}}}
  }
}

````


[COMPLETE_CONTRACT_SEMANTICS]
Exact file: docs/contract_semantics.md

````markdown
# Contract 1.0.0 — runtime invariants

JSON Schema governs structure, types, bounds and required missing-data reasons. It does not prove scientific validity. Python and the browser must also validate the relationships below. TypeScript interfaces are compile-time shapes only; JSON received at runtime requires validation.

- Unique source/profile/location IDs and complete referential integrity. Every non-null measurement, location geometry and derived asset has actual input provenance. A catalog reference is not a source observation.
- `analog.similarity_score` exists only for ranked Earth locations. Unrankable candidates appear in `excluded` with reasons; no numeric placeholder is emitted. Targets with invalid profiles have no ranked analogs. `analogs` is sorted by full-precision descending score then location ID, with consecutive ranks 1..N and N<=3.
- Every ranked row uses the same immutable scoring profile, quantities, units, effective resolution, physical support window, methods and temporal aggregation. All profile features are required. Profile bounds are versioned independent calibration, never refitted to current candidates. Check lower<upper, unique keys, finite inputs, bounds and source references. No silent clipping. Profile changes need a version change.
- `coverage` means valid active-profile weight / total active-profile weight. Ranked entries therefore have coverage 1. It is not full physical coverage of a Moon/Mars environment. Display active features out of the nine numerical features and the profile name. Geology is a separate categorical field, excluded from LOOP_0 arithmetic.
- `Feature.quantity` is a semantic identifier, including surface versus 2 m air temperature and albedo spectral/illumination definition. `method` records derivation and aggregation; period uses UTC timestamps, start<=end. Surface-temperature extrema from different coverage/aggregation are not automatically comparable. Missing is null with reason; zero remains a real value.
- Numeric features have canonical units in schema. `solar_irradiance_kwh_m2` is a legacy API field name for mean daily irradiation in kWh/m2/day, not instantaneous irradiance. Do not change its meaning silently.
- Mean slope<=max slope; min temperature<=max temperature where comparable. Finite values only. Coordinate source frame must be converted, not relabelled. Longitude is east-positive in [-180,180]. Heightmap origin uses the location body's coordinate frame. Planetary CRS parameters and input datum/labels remain in source sidecars.
- `aoi.local_path` is a same-origin `/assets/...` URL to the published real AOI GeoJSON. Its source records identify original geometry. GeoJSON lon/lat is interpreted in the explicit location body/frame; do not silently treat planetary geometry as WGS84. Validate rings, coordinate ranges, closure, antimeridian handling and membership offline. Raw source `local_path` is relative to repository root.
- Source sidecars preserve CRS/datum, vertical units, no-data value, product version, observation time, quality flags, original labels and transformation method. `Source.local_path` identifies actual cached raw bytes and must match its SHA256. Document companion labels and sidecars in the source manifest with their own checksums.
- Heightmaps are grid nodes in row-major order. x increases west→east, z increases north→south, y is up, all metres. `extent_m=[x_min,z_min,x_max,z_max]`, minima<maxima; spacing=(max-min)/(count-1). Height floats are offsets from `origin.elevation_m`; values are finite little-endian Float32. Mask is Uint8 (0 invalid,1 valid), exactly width*height bytes. Height buffer is exactly width*height*4 bytes. A zero at mask=0 is storage padding, not an observation. Do not interpolate or allow collision across invalid nodes.
- Camera position/lookAt are local metres with y relative to origin. Require near<far and nonzero viewing direction; validate initial position over valid supported terrain before ground entry. FOV and eye height are UI settings, not NASA observations.
- `Splat.world_from_asset` is a Three.js column-major 4x4 affine matrix into the heightmap frame. Validate finite, nonsingular transform; reject unsupported shear/reflection rather than silently misregistering it. Its translation is metres. Splats used for metric movement require metric scale and real registration. `inferred` geometry cannot provide scientific measurements; LOOP_0 ground navigation requires a sourced DEM and measured registration. A plain point-cloud PLY is not automatically a Gaussian PLY.
- Resolve local paths and reject escapes from the intended repository/public roots, including symlinks. Verify hashes, file sizes and file formats before publication and before expensive browser allocation. Asset budgets are engineering policy, never altered scientific heights.
- A neutral orbital sphere is a UI reference surface, not a DEM. A Pegman drop only selects an existing prepared AOI, with snapping visibly disclosed. An unsupported drop yields no measurement or score. Sun azimuth and horizon are N/A until their inputs and algorithm exist.

## Scoring definition

For common normalized vectors x,y in [0,1], positive weights w and W=sum(w):

`D=sqrt(sum(w*(x-y)^2)/W)`; `C=sum(w*x*y)/sqrt(sum(w*x*x)*sum(w*y*y))`.

Both zero norms give C=1; exactly one zero norm gives C=0. `score=100*(alpha*C+(1-alpha)*(1-D))`. This is a project-defined similarity index, not a NASA-approved habitability probability. Round only for display.

Per-feature percentage is `100*(1-abs(x-y))`; squared-distance contribution is `w*(x-y)^2/W`. Percentages are not additive contributions to the total score.

## State gate

LOOP_0 preparation does not complete either implementation module. Only explicit human `[PASS: Dev_A/...]` and `[PASS: Dev_B/...]` permit PHASE 5. Any FAIL/PERF_WARN pauses progression and produces a targeted hotfix prompt. Do not treat an empty dataset or skipped WebGL test as demo acceptance.

````


[CHALLENGE_ACCEPTANCE_CRITERIA]
Exact file: docs/orchestration/REQUIREMENTS_CHALLENGE_ADDENDUM.json

````json
{
  "document": "PAE_CHALLENGE_ALIGNMENT_ADDENDUM",
  "version": "1.1.0",
  "created_on": "2026-11-14",
  "type": "proposed_project_acceptance_traceability",
  "implementation_pass": false,
  "changes_original_requirements": false,
  "changes_repo_state": false,
  "official_source": {
    "main_url": "https://www.spaceappschallenge.org/2026/challenges/permanent-moon-base-locations-and-mars/",
    "resources_url": "https://www.spaceappschallenge.org/2026/challenges/permanent-moon-base-locations-and-mars/?tab=resources",
    "main_description_evidence": "Verified indexed main-page description provided by Astra in the task context; no new resource-tab claim.",
    "supported_intent": "Use open Earth, Moon and Mars data to identify and characterize new terrestrial analog candidates and present results through a map, visualization or other tool.",
    "resources_membership_evidence_type": "user_provided_page_content",
    "resources_membership_supplied": true,
    "resources_list_count": 11,
    "resources_tab_independently_retrieved": false,
    "individual_target_urls_independently_verified_in_this_review": false,
    "resource_names_supplied": {
      "NASA": [
        "Earthdata Search",
        "Worldview",
        "Planetary Data System",
        "LRO mission archive",
        "Diviner"
      ],
      "CSA": [
        "RCM",
        "RADARSAT-1",
        "SAR tutorial"
      ],
      "ESA": [
        "Copernicus Data Space",
        "Open Science Catalog"
      ],
      "JAXA": [
        "G-Portal"
      ]
    },
    "primary_target_verification_separate": true
  },
  "interpretation": {
    "known_sites_only_sufficient": false,
    "known_sites_role": "Documented benchmark and sanity-check baseline.",
    "new_definition": "New candidate relative to a frozen, sourced project baseline within a declared search domain; not a world-first or NASA approval claim.",
    "project_minimum": "At least one qualified non-baseline candidate from reproducible systematic search; original top-3 acceptance remains separate.",
    "not_claimed_as_nasa_mandates": [
      "Cosine/Euclidean formula",
      "Gaussian Splatting or Three.js",
      "60 FPS",
      "Exactly three candidates",
      "Apache-2.0 as the only permitted license",
      "The project-specific at-least-one discovery threshold"
    ]
  },
  "existing_gaps": [
    {
      "requirement_ids": [
        "REQ-011",
        "REQ-012"
      ],
      "gap": "Curated candidates can satisfy the current wording without baseline-relative discovery."
    },
    {
      "requirement_ids": [
        "REQ-004",
        "REQ-005",
        "REQ-013"
      ],
      "gap": "Correct scoring does not establish systematic candidate enumeration or novelty."
    },
    {
      "requirement_ids": [
        "REQ-016",
        "REQ-017",
        "REQ-019",
        "REQ-021",
        "REQ-032"
      ],
      "gap": "Current views need not expose search domain, known/new distinction, uncertainty or coverage evidence."
    }
  ],
  "contract_policy": {
    "shared_version_unchanged": "1.0.0",
    "new_fields_in_existing_strict_dataset": false,
    "proposed_sidecar": "A separately agreed discovery manifest/GeoJSON linked by existing location_id and profile_id.",
    "proposal_is_implemented": false
  },
  "requirements": [
    {
      "id": "CHAL-001",
      "title": "Trace user-supplied Resources membership separately from verified target/product use",
      "priority": "P0_CHALLENGE_ALIGNMENT",
      "owner": "Researcher + Astra",
      "loop": "LOOP_0",
      "related_requirement_ids": [
        "REQ-028",
        "REQ-032"
      ],
      "acceptance_checks": [
        "Record the official main/resources URLs and distinguish indexed main-page content from user_provided_page_content membership for all 11 listed resources.",
        "Verify target URLs, archive/product relationships, selected versions and terms separately; do not relabel all existing source-registry products as explicitly listed.",
        "Label project policy/formula/performance/licensing decisions separately from confirmed challenge instructions.",
        "Record the contextual scope of GO Team guidance and do not claim team eligibility without the complete evidence chain."
      ],
      "evidence_required": [
        "User-provided Resources content and stable resource registry IDs",
        "Primary-target/product relationship verification records",
        "GO Team guidance with scope and no eligibility claim"
      ],
      "status": "PARTIAL"
    },
    {
      "id": "CHAL-002",
      "title": "Freeze a sourced known-analog baseline before candidate selection",
      "priority": "P0_CHALLENGE_ALIGNMENT",
      "owner": "Researcher + Dev_A",
      "loop": "LOOP_1",
      "related_requirement_ids": [
        "REQ-002",
        "REQ-008",
        "REQ-012"
      ],
      "acceptance_checks": [
        "Version/hash the known-analog list with sources and documented geometry uncertainty.",
        "Declare search domain and spatial overlap/separation rules before viewing results.",
        "Uncertain known-site geometry yields unresolved novelty rather than a positive novelty claim."
      ],
      "evidence_required": [
        "Baseline manifest and geometry/source refs",
        "Recorded exclusion/grouping policy",
        "Baseline cutoff/version/hash"
      ],
      "status": "NOT_VERIFIED"
    },
    {
      "id": "CHAL-003",
      "title": "Systematic candidate generation from real geospatial coverage",
      "priority": "P0_CHALLENGE_ALIGNMENT",
      "owner": "Dev_A",
      "loop": "LOOP_1",
      "related_requirement_ids": [
        "REQ-006",
        "REQ-008",
        "REQ-009",
        "REQ-012"
      ],
      "acceptance_checks": [
        "Derive reproducible grid/windows from real georeferenced source coverage; label AOIs as analysis units.",
        "Keep stable candidate IDs and account for generated/invalid/excluded/eligible candidates.",
        "Document candidate generation parameters and real processed area without overlap double counting.",
        "Candidate selection is not limited to a whitelist of already named analog sites or chosen retrospectively for attractive scores."
      ],
      "evidence_required": [
        "Search-domain GeoJSON and source metadata",
        "Enumeration parameters/code/revision",
        "Complete accounting and union-area calculation"
      ],
      "status": "NOT_VERIFIED"
    },
    {
      "id": "CHAL-004",
      "title": "Matched-scale frozen-profile screening without selection leakage",
      "priority": "P0_CHALLENGE_ALIGNMENT",
      "owner": "Dev_A + Code_Reviewer",
      "loop": "LOOP_1",
      "related_requirement_ids": [
        "REQ-003",
        "REQ-004",
        "REQ-005",
        "REQ-009",
        "REQ-013"
      ],
      "acceptance_checks": [
        "Apply one profile with compatible quantities, methods, spatial support and effective resolution to the declared ranking cohort.",
        "Calibration is fixed independently of the shortlisted winners; no hidden per-candidate feature masks or clipped values.",
        "Known/new labels do not alter the numerical score.",
        "Missing or incompatible candidates retain explicit exclusion reasons."
      ],
      "evidence_required": [
        "Profile/calibration hashes and data lineage",
        "Actual candidate feature table",
        "Invariant and exclusion tests"
      ],
      "status": "NOT_VERIFIED"
    },
    {
      "id": "CHAL-005",
      "title": "Qualified non-baseline candidate and defensible novelty claim",
      "priority": "P0_CHALLENGE_ALIGNMENT",
      "owner": "Dev_A + Researcher",
      "loop": "LOOP_1",
      "related_requirement_ids": [
        "REQ-011",
        "REQ-012"
      ],
      "acceptance_checks": [
        "At least one qualified candidate comes from systematic search outside the frozen baseline under the declared overlap policy.",
        "Adjacent windows are grouped/filtered by a predetermined spatial rule; they are not advertised as distinct sites to fill top-3.",
        "Each selected candidate has novelty status and supporting evidence; limited-baseline novelty is explicit.",
        "Fewer than three eligible independent results remain fewer than three; original top-3 criterion is not marked complete."
      ],
      "evidence_required": [
        "Shortlist GeoJSON and stable IDs",
        "Baseline overlap/grouping audit",
        "Novelty-check source/query log and limitations"
      ],
      "status": "NOT_VERIFIED"
    },
    {
      "id": "CHAL-006",
      "title": "Scientific characterization and uncertainty disclosure",
      "priority": "P0_CHALLENGE_ALIGNMENT",
      "owner": "Dev_A + Researcher",
      "loop": "LOOP_1",
      "related_requirement_ids": [
        "REQ-002",
        "REQ-003",
        "REQ-009",
        "REQ-019"
      ],
      "acceptance_checks": [
        "Each shortlisted ROI reports matched attributes, source/method/resolution/valid fraction and unmeasured/non-comparable dimensions.",
        "Use available QA/uncertainty information; missing uncertainty is not_quantified, never fabricated error bars.",
        "Report reproducible rank sensitivity to documented justified profile/scale alternatives without calling it a probability or confidence interval.",
        "Topography-only results are described as morphological candidates, not complete environmental analogs or suitable base sites."
      ],
      "evidence_required": [
        "Characterization and quality report",
        "Sensitivity inputs/results and limitations",
        "Independent extraction cross-check or clearly labeled reproducibility check"
      ],
      "status": "NOT_VERIFIED"
    },
    {
      "id": "CHAL-007",
      "title": "Map discovery evidence and distinguish baseline from findings",
      "priority": "P0_CHALLENGE_ALIGNMENT",
      "owner": "Dev_B",
      "loop": "LOOP_1",
      "related_requirement_ids": [
        "REQ-014",
        "REQ-016",
        "REQ-017",
        "REQ-019",
        "REQ-021"
      ],
      "acceptance_checks": [
        "Display real search-domain/candidate AOI geometry and distinct known-baseline/new-candidate/unresolved labels.",
        "Expose target/profile/baseline identity, coverage/exclusions, source URLs and characterization limitations.",
        "A map label/score links to the same exported location ID; no fabricated terrain or unsupported geographic extent.",
        "Offline static artifacts support the map; ground/splat mode is available only when real assets exist."
      ],
      "evidence_required": [
        "Real-data map/browser evidence",
        "Source/export ID matching checks",
        "Network log and local asset manifest"
      ],
      "status": "NOT_VERIFIED"
    },
    {
      "id": "CHAL-008",
      "title": "Reproducible discovery demonstration and scoped acceptance",
      "priority": "P0_CHALLENGE_ALIGNMENT",
      "owner": "Astra + Requirements_Manager + Dev_A + Dev_B",
      "loop": "LOOP_3",
      "related_requirement_ids": [
        "REQ-025",
        "REQ-026",
        "REQ-030",
        "REQ-031",
        "REQ-032"
      ],
      "acceptance_checks": [
        "Regenerate the same candidate enumeration and shortlist from frozen source/baseline/profile revisions.",
        "Show evidence for both identification and characterization; distinguish benchmark performance from discovery.",
        "Claims about area, novelty, uncertainty and performance reflect measured evidence and declared scope.",
        "Retain all original human PASS/review gates; this addendum and prepared artifacts do not close any requirement."
      ],
      "evidence_required": [
        "Revision-bound reproduction logs and maps",
        "Final CHAL plus original requirement report",
        "Both explicit human PASS signals for the integrated accepted revision"
      ],
      "status": "NOT_VERIFIED"
    },
    {
      "id": "CHAL-009",
      "title": "Trace at least one listed NASA resource through actual product use to the UI",
      "priority": "P0_CHALLENGE_ALIGNMENT",
      "owner": "Researcher + Dev_A + Dev_B + Requirements_Manager",
      "loop": "LOOP_1",
      "related_requirement_ids": [
        "REQ-002",
        "REQ-014",
        "REQ-025",
        "REQ-028",
        "REQ-031",
        "REQ-032"
      ],
      "acceptance_checks": [
        "At least one NASA challenge_resource_id from the documented Resources membership resolves through a verified relationship to the actual selected product/version/access URL.",
        "The exact raw file has a local path, retrieval evidence and matching SHA-256; supporting documentation is not substituted for scientific data usage.",
        "A declared method derives a feature/artifact, linked to exported location/asset IDs and the fixed profile where applicable.",
        "Actual UI consumption of that derived result is demonstrated; merely citing, downloading or displaying a logo does not satisfy use.",
        "Related external and partner products retain explicit relationship type and actual license; no product is called explicitly listed without evidence.",
        "The evidence chain supports project traceability, not an automatic statement of Global Awards eligibility."
      ],
      "evidence_required": [
        "challenge_resource_id and membership evidence",
        "Primary target and resource-to-product relationship record",
        "Selected product/raw checksum manifest",
        "Reproduction method and derived artifact/feature lineage",
        "Actual UI use evidence tied to exported IDs"
      ],
      "status": "NOT_VERIFIED"
    }
  ],
  "loop_mapping": {
    "LOOP_0": "Prepare discovery/baseline contract and source traceability only; no phase advancement implied.",
    "LOOP_1": "Run a bounded real-data discovery slice alongside current integration.",
    "LOOP_2": "Explore confirmed candidate scenes with split-screen/splat as actual assets permit.",
    "LOOP_3": "Reproduce discovery offline and audit source, novelty and presentation claims."
  },
  "current_evidence": {
    "candidate_search_performed": false,
    "nonbaseline_candidate_validated": false,
    "discovery_map_verified": false,
    "note": "This artifact specifies an acceptance gap; downloaded source files or existing prompts are not discovery evidence.",
    "resources_membership_supplied": true,
    "resource_to_ui_chain_verified": false
  },
  "gate": "No implementation PASS and no PHASE_5. Existing paired human Dev_A/Dev_B acceptance remains mandatory.",
  "go_team_guidance": {
    "url": "https://github.com/nasa/spaceapps/discussions/1849",
    "author": "Nick-GO-Team",
    "answer_date": "2026-11-06",
    "verified_in_this_review": true,
    "context": "Different challenge discussion; generally worded GO Team answer.",
    "guidance": "For Global Awards, use at least one NASA data source included in the challenge Resources; additional NASA/partner Resources are encouraged but optional.",
    "application": "Require evidence of a listed NASA resource actually used in this project, with verified resource-to-product relation.",
    "eligibility_claimed": false
  },
  "resource_traceability_policy": {
    "chain": [
      "challenge_resource_id",
      "verified_resource_product_relationship",
      "selected_product_id_version_access_url",
      "local_raw_path_and_sha256",
      "derived_feature_or_artifact_and_method",
      "exported_location_or_asset_id",
      "actual_ui_use"
    ],
    "relationship_types": [
      "listed_archive_child",
      "related_external_product",
      "external_supplement",
      "supporting_documentation"
    ],
    "existing_registry_relabelled_as_official": false,
    "membership_does_not_prove_product_use": true,
    "download_alone_does_not_close_acceptance": true,
    "eligibility_claimed": false
  }
}

````
