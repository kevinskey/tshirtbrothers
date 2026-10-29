import { Worker } from 'node:worker_threads';

let active = false;
const queue = [];
function next() {
  if (active || !queue.length) return;
  active = true;
  const job = queue.shift();
  const worker = new Worker(new URL('./embroideryWorker.js', import.meta.url), { workerData: job.data });
  const timeout = setTimeout(() => { worker.terminate(); finish(new Error('Artwork processing timed out.')); }, 30_000);
  let done = false;
  function finish(error, result) {
    if (done) return; done = true; clearTimeout(timeout);
    worker.terminate(); active = false;
    if (error) job.reject(error); else job.resolve(result);
    next();
  }
  worker.once('message', message => finish(message.error ? new Error(message.error) : null, message.result));
  worker.once('error', error => finish(error));
  worker.once('exit', code => { if (!done) finish(new Error(`Artwork worker stopped (${code}).`)); });
}
export function runEmbroideryWorker(task, png, options) {
  if (queue.length >= 4) return Promise.reject(Object.assign(new Error('Artwork queue is full. Try again shortly.'), { status: 429 }));
  return new Promise((resolve, reject) => { queue.push({ data: { task, png, options }, resolve, reject }); next(); });
}
