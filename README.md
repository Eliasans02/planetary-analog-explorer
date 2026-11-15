# ASTRAS — Planetary Analog Explorer

ASTRAS helps researchers and students identify Earth locations that resemble lunar and Martian landscapes. It combines interactive Earth, Moon and Mars exploration, measured terrain comparisons, research-guided missions, and downloadable scientific reports. Built for Challenge 5: identifying terrestrial analogs for Moon and Mars exploration.

## Presentation and demo

These files are hosted in this public repository and require no account:

- [Russian presentation — 7 slides, PDF](deliverables/presentation/ASTRAS_Презентация_RU.pdf)
- [Editable PowerPoint](deliverables/presentation/ASTRAS_Презентация_RU.pptx)
- [30-second demo — MP4, 1920 × 1080](https://raw.githubusercontent.com/Eliasans02/planetary-analog-explorer/main/deliverables/demo/ASTRAS-demo-30s.mp4)
- [Remotion source and image assets](deliverables/demo)
- [Example scientific report: Rio Tinto / Mars](deliverables/reports/rio-tinto-research-report.pdf)

The demo is an animated walkthrough of actual project screenshots, not a continuous screen recording. Presentation and video captions are in Russian; this project description and documentation are in English.

## What you can do

- Explore Earth, Moon and Mars in one workspace, with 20 planetary destinations and six prepared native planetary terrain sites.
- Investigate eight Earth regions: Ustyurt, Atacama, Rio Tinto, Haughton, Hawaii, Lanzarote, Pilbara and the Antarctic Dry Valleys.
- Compare 2,261 usable Earth terrain windows in surveyed areas totaling 828 km². Rankings are calculated within the selected region.
- Follow four-stop guided research missions with questions based on seven primary scientific publications.
- Rotate paired 3D surfaces with synchronized cameras, common height scales, contours and elevation profiles.
- Download PDF reports, GeoJSON and JSON evidence with source attribution and data hashes.

To download a report: select **Earth**, choose a region and planetary target, then click **Details →** on the candidate card at the bottom-left. Click **Download PDF report** near the top of the details panel.

## Run locally

Prerequisites: Git, Node.js 22.12+ (or a newer supported LTS release), and npm. Clone the entire repository: `shared/` must remain alongside `web-client/`.

```sh
git clone https://github.com/Eliasans02/planetary-analog-explorer.git
cd planetary-analog-explorer/web-client
npm ci
npm run build
npm run preview -- --port 4173 --strictPort
```

Open **http://127.0.0.1:4173/**. For development, run `npm run dev` and open **http://127.0.0.1:3000/**. On Windows PowerShell, use `npm.cmd` if script execution policy blocks `npm`.

Prepared imagery, terrain buffers, catalogs and provenance are committed. Running the application requires no NASA API key, Python environment or raw source downloads. Do not open `index.html` directly. Some external imagery and research links require internet access. The localhost address is a local preview, not a public deployment.

Checks, from `web-client/`:

```sh
npm run typecheck
npm test
npm run build
npm run verify:surfaces
npm run verify:planets
```

## NASA data actually used

The application uses prepared derivatives of downloaded datasets; it does not claim a live NASA API connection. Exact URLs, processing metadata and hashes are retained in the public catalogs.

| Dataset | Direct source | Use |
| --- | --- | --- |
| LRO / LOLA Site04, 5 m/pixel | [NASA GSFC elevation GeoTIFF](https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site04/Site04_final_adj_5mpp_surf.tif) | Shackleton-region lunar terrain and comparison target |
| MRO / HiRISE Jezero DTM | [Dataset page](https://www.uahirise.org/dtm/dtm.php?ID=ESP_045994_1985), [PDS IMG file](https://hirise-pds.lpl.arizona.edu/PDS/DTM/ESP/ORB_045900_045999/ESP_045994_1985_ESP_046060_1985/DTEEC_045994_1985_046060_1985_U01.IMG) | Martian elevation target; NASA/JPL/University of Arizona |
| NASA SVS Moon Kit | [Dataset page](https://svs.gsfc.nasa.gov/4720/), [LOLA displacement GeoTIFF](https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_4.tif) | Lunar globe imagery and coarse relief |
| NASA Mars 3D resources | [NASA-published Mars texture](https://science.nasa.gov/3d-resources/mars/) | Viking-derived global display texture |
| NASA Blue Marble: Next Generation | [Dataset description](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/), [August image](https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-base/august/world.200408.3x5400x2700.jpg) | Earth globe context imagery |

Earth comparison elevations come from **Copernicus GLO-30 DSM**, not NASA. Example: [Ustyurt elevation GeoTIFF](https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N43_00_E054_00_DEM/Copernicus_DSM_COG_10_N43_00_E054_00_DEM.tif).

Source catalogs: [Earth comparison provenance](web-client/public/data/earth_discovery.json), [worldwide research catalog](web-client/public/data/global_analogs.json), [planet catalog](web-client/public/data/planet_catalog.json). The research catalog includes the primary-paper references and DOI links.

## Method and limits

Each quantitative comparison uses a 600 × 600 m window aggregated to a 10 × 10 grid at 60 m spacing. Candidate distance combines 70% slope-distribution total variation and 30% normalized relief difference. Two planetary targets are prepared for this comparison: Shackleton (LOLA) and Jezero (HiRISE).

This is exploratory terrain similarity, not a probability, global best-match search, landing-safety assessment or base-suitability certification. Copernicus is a surface model and can include vegetation and structures. Literature findings provide geological, biological and geophysical context; raw laboratory samples were not imported. Photographic drapes, interpolated display surfaces and vertical exaggeration do not create new measurements. Gaussian reconstruction is not implemented.

## Resources and AI disclosure

AI tools were used in this project. Google Gemini / Hydrogen assisted with the initial code generation. OpenAI tools, including Astra and Codex, assisted with architecture, implementation, debugging, testing, scientific-source discovery, documentation, translation, presentation wording and layout, and Remotion video code. AI assistance is not independent scientific validation. Terrain values are derived from the attributed source datasets; cited research findings are not presented as AI-generated measurements.

Presentation design adapts [BlakeCube's Canva template](https://www.canva.com/templates/EAHX_ZJYjrE/). Video uses Remotion and actual application screenshots. The project uses React, Three.js, Vite and jsPDF; dependency versions are recorded in package manifests and lockfiles. Historical contribution details remain in [the AI and data attribution log](AI_AND_DATA_ATTRIBUTION_LOG.json).

## Rebuild the deliverables

For the video, enter `deliverables/demo`, run `npm install`, then `npm run render`. The render requires a Chromium browser managed by Remotion. The composition contains 900 frames at 30 fps. The submitted MP4 omits the renderer's empty audio track to avoid audio-padding duration overrun.

For the PowerPoint, install `python-pptx` and Pillow, then run `python deliverables/presentation/build_deck.py` from the repository root. The source template, screenshots and report image are included. Export the resulting PowerPoint to PDF using PowerPoint or LibreOffice.

Original project code is Apache-2.0. Third-party data, software and template assets retain their respective licenses and attribution requirements. Earlier checkpoints and research/acquisition records remain under `docs/` and `evidence/`; their historical status should not be confused with the current feature summary above.
