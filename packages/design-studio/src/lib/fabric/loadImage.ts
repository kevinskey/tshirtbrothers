import { FabricImage } from 'fabric';

/**
 * Load an image into Fabric, preferring CORS-enabled fetch so the resulting
 * canvas is exportable via toDataURL / toSVG. Falls back to a no-CORS load
 * if the server doesn't send Access-Control-Allow-Origin — the image will
 * display correctly but the canvas becomes "tainted" and exports throw.
 *
 * Both editors (DesignStudio post-port, GangSheetBuilder) need this exact
 * pattern, so it lives here rather than duplicated in each.
 */
export async function loadFabricImage(url: string): Promise<FabricImage> {
  try {
    return await FabricImage.fromURL(url, { crossOrigin: 'anonymous' });
  } catch {
    return await FabricImage.fromURL(url);
  }
}
