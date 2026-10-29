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
