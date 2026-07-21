// wawoff2 ships untyped (CommonJS Emscripten module). Used by
// lib/fabric/loadFontForText.ts to decompress Google Fonts woff2 binaries
// to TTF for opentype.js path generation.
declare module 'wawoff2' {
  export function decompress(buffer: Uint8Array): Promise<Uint8Array>;
  export function compress(buffer: Uint8Array): Promise<Uint8Array>;
  const _default: { decompress: typeof decompress; compress: typeof compress };
  export default _default;
}
