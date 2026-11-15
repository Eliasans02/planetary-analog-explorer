# Challenge resources in the development loop

The user supplied the complete Resources-tab text on 2026-11-14. `CHALLENGE_RESOURCES.json` records all 11 entries, original and canonical URLs, intended use, limitations and separate provider verification. Membership comes from that supplied text; a failed direct page fetch is not presented as successful verification.

## Immediate decisions

- **Earthdata + PDS/LRO form the first scientific path.** Resolve exact Earth and planetary products, process real rasters offline, and trace each displayed result to those products. Existing SRTM CMR metadata is not elevation data. Existing PGDA LOLA Site04 files remain supplemental mission products until their relationship to the listed archive is documented.
- **Diviner remains a priority research source for thermal context.** Keep the first similarity profile topography-only until lunar and terrestrial thermal observables have matching definitions and support. Two-metre air temperature cannot stand in for surface temperature.
- **Worldview informs visual research and QA.** Obtain numerical observations from the underlying product, not screenshot colours.
- **CSA SAR, Copernicus and JAXA are optional extensions with explicit selection criteria.** A product must cover the real AOI, answer a relevant question, permit the intended distribution, and have a documented processing method. Portal listings are not measurements. Do not download all archives or add every provider as a runtime dependency.
- **Known analogs are the baseline.** The challenge's new-candidate objective requires a reproducible search domain and candidates outside the frozen baseline. A result is newly identified relative to that baseline; do not claim it is a world-first discovery.

NASA's 2026 GO Team guidance says Global Award eligibility requires actual use of at least one NASA source included in the challenge resources. The response was made in another challenge discussion; it supplies a general rule, not a certification of this project's compliance. Linking a portal alone does not demonstrate use. [Organizer guidance](https://github.com/nasa/spaceapps/discussions/1849).

## Work assignment

| Owner | Next deliverable | Acceptance evidence |
|---|---|---|
| Researcher | Resource-to-product selection and access report | Exact product identifiers, primary documentation, coverage, QA, terms and blockers |
| Dev_A | A real product through offline preprocessing | Listed resource → product → raw hash → method/QA → derived artifact → actual feature use |
| Dev_B | Offline source details and candidate presentation | Real product attribution, quantity/missingness, geographic search limits; no demo network calls |
| Code reviewer | Scientific and provenance review | Matched support/units, fixed scoring profile, no fabricated constants or unlabelled inference |
| Security evaluator | Download and artifact review | Product access constraints, bounded files, validated local paths, no exported credentials |
| Requirements manager | Challenge alignment review | Actual listed NASA use plus reproducible new-candidate evidence; existing human gates preserved |
| Stitch | Source and uncertainty presentation review | Review only actual labels/screenshots; no invented environmental or approval claims |

## Provider findings affecting implementation

RCM public access is limited to certain products and requires an EODMS account; its product terms must be checked. RADARSAT-1 has an openly licensed archive and is a simpler optional research route when it covers an appropriate candidate. Neither archive's availability guarantees suitable science input. [RCM access](https://www.asc-csa.gc.ca/eng/satellites/radarsat/access-to-data/about.asp), [RADARSAT-1 access](https://www.csa-asc.gc.ca/eng/satellites/radarsat1/data-access.asp).

The CSA tutorial demonstrates Python/QGIS raster handling. We have used its documentation as research guidance, without copying or running its code. Preserve its copyright, permission and additional notice if code is reused. Its example is a fire observation, not a validated analog. [Tutorial](https://github.com/asc-csa/Synthetic_Aperture_Radar_Tutorial), [license](https://github.com/asc-csa/Synthetic_Aperture_Radar_Tutorial/blob/main/LICENSE).

Copernicus documents catalogue and download interfaces including STAC and OData. Use them during preparation only if a selected product is needed. G-Portal provides searches by physical quantities and spacecraft; no JAXA product has yet been selected. ESA Open Science Catalogue's linked page exposed no readable catalogue content through the retrieval tool. [Copernicus APIs](https://dataspace.copernicus.eu/analyse/apis), [G-Portal](https://www.gportal.jaxa.jp/?lang=en), [ESA catalogue](https://opensciencedata.esa.int/).

## Contract and dispatch boundary

The runtime `LocationsDataset` schema remains 1.0.0. Its `Source`, `source_ids`, asset hashes and scientific metadata continue to govern scientific output. Challenge-resource membership is an orchestration sidecar, not an extra undeclared field in strict scientific JSON. Keep catalogue-only entries out of the dataset's acquired-source records.

`prompts/roles/CHALLENGE_RESOURCES_ADDENDUM.md` contains the complete 11-resource context and role-specific outputs. It is prepared locally but has not been sent to external AI Studio or Stitch sessions because browser transport remains unavailable. Original already-dispatched prompts remain intact. No scores, new coordinates, code integration, human PASS or phase advancement are claimed by this update.
