# TSB PNG Embroidery Stitch Estimator (experimental)

Standalone FastAPI service designed for later integration with the existing T-Shirt Brothers Express quoting backend. It does not modify the live quoting or pricing flow.

## Run
```bash
cd integrations/embroidery-stitch-estimator
python -m pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8000
```
Visit http://127.0.0.1:8000/docs for interactive API documentation.

## API
`POST /api/v1/embroidery/estimate` multipart form fields:
- `file`: PNG file, up to 15 MB
- `width_in`: finished embroidery width (0.25–20 inches)
- `height_in`: optional finished height
- `spacing_mm`: optional stitch spacing (default 0.42)

Returns `estimated_stitches`, `low_stitches`, `high_stitches`, `color_count_estimate`, `coverage_pct`, and a breakdown. This is a heuristic estimate, **not a DST stitch count**. Calibrate with real digitized files before using it to quote customers.

## Integration plan
1. Deploy as an internal service with authentication, request limits and restricted network access.
2. Add a server-side Express proxy route using existing customer authentication and file upload controls.
3. Feed its stitch-count range to the existing pricing engine; do not hardcode rates in this service.
4. Add UI in the embroidery quote workflow and test against production digitized DST files.

Do not expose this prototype publicly without security review and additional input validation.

## Web interface

Open https://tshirtbrothers.com/stitch-estimator and sign in with a TSB admin account. The admin sidebar and Embroidery section also link to the estimator. Upload a still PNG (8 MB / 12 megapixels maximum), enter width and optional height, and copy the preliminary count range into quote notes. No artwork is persisted and no customer quote or price is changed automatically.

The Express endpoint `POST /api/admin/stitch-estimator` requires existing admin authentication, accepts multipart PNG uploads, validates finite dimensions, limits requests and concurrent processing, and forwards only to the fixed loopback service. Larger images are normalized to a maximum 1200-pixel edge for bounded processing. The Python service remains private.

The application deployment runs `server/scripts/check-stitch-estimator.mjs` to verify authentication, a real PNG estimate through Express, and HTTPS page availability. The smoke check uses a short-lived synthetic admin token only in process memory and creates no account or quote records.


### Embroidery mockup preview

Each estimate also returns an `embroidery_preview` with a transparent PNG data URL. Its thread texture is procedural, preserving source geometry/alpha and matching the estimator's opaque-white background removal. It is a visual simulation, not a DST render or a promise of actual digitizing paths.

Download PNG exports that artwork. **Use in Mockup** uploads only on click, saves an embroidery-labeled draft via the existing mockup API, and opens Design Studio with that draft. Choose a garment, adjust the placement and save using the normal mockup workflow. Estimate notes include finished size and the count range. No quote price changes automatically.


### Saved workflow upgrade

The estimator now trims visible artwork bounds by default and offers explicit edge-white background removal versus preserving all colors. Edge-connected white is removed by flood fill so enclosed white details remain. Locked proportions are the default; unlocked finished dimensions resize both the count input and preview consistently. The internal API passes an explicit alpha mask to the Python estimator.

CPU-heavy artwork preparation and thread rendering run through a bounded worker-thread queue. The main website API no longer runs the per-pixel preview loop. The latest four unsaved results are held temporarily for up to 15 minutes; staff can save originals privately in Spaces and keep a reusable preview, settings and planning estimate in PostgreSQL. Saved estimates can be linked to a quote, restored, and reused in one mockup draft with inch-based element dimensions. Repeated handoffs reuse the draft. The quote form can open the estimator and apply its preliminary count without sending a customer quote.

Actual digitized stitch counts can be recorded manually or read from a DST header in the browser. These records support later calibration; the current algorithm remains an uncalibrated planning heuristic. A changed size/artwork needs a new estimate.

The application deployment smoke test now checks save/restore, actual-count capture and mockup sizing using disposable records and assets, which it cleans up. Database migration: server/migrations/embroidery_estimates.sql.
