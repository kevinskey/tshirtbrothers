export function embroideryMockupFields(record) {
  const { width_in: width, height_in: height } = record.data;
  const canvas = Math.max(12, width, height);
  const w = width / canvas * 100, h = height / canvas * 100;
  return {
    name: `Embroidery — ${record.name}`,
    quote_id: record.quote_id,
    graphic_url: record.preview_url,
    preview_image_url: record.preview_url,
    design_canvas_inches: canvas,
    design_canvas_inches_h: canvas,
    design_elements: [{ id: `embroidery-${record.id}`, type: 'image', content: record.preview_url,
      x: (100 - w) / 2, y: (100 - h) / 2, width: w, height: h, side: 'front' }],
    notes: `Simulated embroidery preview. Estimate #${record.id}. Artwork ${width} × ${height} inches; ${record.data.estimated_stitches} estimated stitches. Changing artwork size requires a new estimate. Confirm against the digitized file.`,
  };
}
