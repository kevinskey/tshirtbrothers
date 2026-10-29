import { parentPort, workerData } from 'node:worker_threads';
import { prepareEmbroideryArtwork } from './embroideryArtwork.js';
import { renderEmbroideryPreview } from './embroideryPreview.js';

try {
  const result = workerData.task === 'prepare'
    ? await prepareEmbroideryArtwork(Buffer.from(workerData.png), workerData.options)
    : await renderEmbroideryPreview(Buffer.from(workerData.png), { ...workerData.options, preserveAlpha: true });
  parentPort.postMessage({ result });
} catch (error) { parentPort.postMessage({ error: error.message }); }
