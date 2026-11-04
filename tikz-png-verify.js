/* Validate physical PNG resolution after cloud compilation.
   Poppler/pdftoppm writes pHYs pixels-per-meter metadata with -r DPI.
   This catches stale Cloud Run compiler revisions that silently use 160 DPI. */
(function(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MimoPngResolution = api;
})(typeof window !== "undefined" ? window : null, function() {
  "use strict";

  function parsePngMetadata(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length < 33 ||
        bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71 ||
        bytes[4] !== 13 || bytes[5] !== 10 || bytes[6] !== 26 || bytes[7] !== 10)
      throw Error("Compiler returned an invalid PNG.");

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 8, dpiX = null, dpiY = null, width = null, height = null;
    while (offset + 12 <= bytes.length) {
      const size = view.getUint32(offset);
      const type = String.fromCharCode(bytes[offset+4],bytes[offset+5],
                                     bytes[offset+6],bytes[offset+7]);
      if (size > bytes.length - offset - 12)
        throw Error("Compiler returned a truncated PNG.");
      if (type === "IHDR" && size === 13) {
        width = view.getUint32(offset+8);
        height = view.getUint32(offset+12);
      }
      if (type === "pHYs" && size === 9 && bytes[offset+16] === 1) {
        dpiX = view.getUint32(offset+8) * 0.0254;
        dpiY = view.getUint32(offset+12) * 0.0254;
      }
      if (type === "IDAT") break; // pHYs is required to precede image data.
      offset += 12 + size;
    }
    return {width,height,dpiX,dpiY};
  }

  async function verify(blob, expectedDpi) {
    if (!Number.isInteger(expectedDpi) || expectedDpi < 72 || expectedDpi > 600)
      throw Error("Selected PNG resolution is invalid.");
    if (!blob || typeof blob.arrayBuffer !== "function" ||
        !Number.isFinite(blob.size) || blob.size < 33 || blob.size > 8*1024*1024)
      throw Error("Cannot verify PNG output size or resolution.");
    const meta = parsePngMetadata(new Uint8Array(await blob.arrayBuffer()));
    if (!meta.width || !meta.height)
      throw Error("Compiler returned a PNG without valid dimensions.");
    if (meta.dpiX === null || meta.dpiY === null)
      throw Error("PNG resolution metadata is missing. Cannot verify selected DPI.");
    if (Math.abs(meta.dpiX-expectedDpi) > 1 || Math.abs(meta.dpiY-expectedDpi) > 1)
      throw Error(
        "Requested "+expectedDpi+" DPI, but compiler returned "+
        Math.round((meta.dpiX+meta.dpiY)/2)+" DPI. "+
        "The active Cloud Run compiler/backend revision may be outdated."
      );
    return meta;
  }
  return {parsePngMetadata,verify};
});
