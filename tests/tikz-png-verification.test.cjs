"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const MimoPngResolution = require("../tikz-png-verify.js");

function pngAt(dpi, width = 213, height = 213) {
  const signature = Buffer.from([137,80,78,71,13,10,26,10]);
  const chunk = (name, data) => {
    const result = Buffer.alloc(data.length+12);
    result.writeUInt32BE(data.length,0);
    result.write(name,4,"ascii");
    data.copy(result,8);
    return result;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width,0);
  ihdr.writeUInt32BE(height,4);
  ihdr[8] = 8; ihdr[9] = 2;
  const phys = Buffer.alloc(9);
  phys.writeUInt32BE(Math.round(dpi/0.0254),0);
  phys.writeUInt32BE(Math.round(dpi/0.0254),4);
  phys[8] = 1;
  return new Blob([Buffer.concat([
    signature, chunk("IHDR",ihdr),chunk("pHYs",phys),chunk("IDAT",Buffer.alloc(0))
  ])],{type:"image/png"});
}

test("checks actual embedded DPI, not the frontend selected label",async()=>{
  for(const selected of [160,240,300,450,600]){
    const meta=await MimoPngResolution.verify(pngAt(selected),selected);
    assert.equal(meta.width,213);
    assert.equal(meta.height,213);
    assert.ok(Math.abs(meta.dpiX-selected)<1);
  }
  await assert.rejects(MimoPngResolution.verify(pngAt(160),300),/Requested 300 DPI, but compiler returned 160 DPI/);
  await assert.rejects(MimoPngResolution.verify(pngAt(160),600),/Requested 600 DPI, but compiler returned 160 DPI/);
});

test("unverifiable or invalid PNG is rejected rather than falsely marked high resolution",async()=>{
  for(const bad of [
    new Blob([Buffer.alloc(15)],{type:"image/png"}),
    new Blob([Buffer.alloc(35)],{type:"image/png"}),
    new Blob([Buffer.from([137,80,78,71,13,10,26,10])],{type:"image/png"}),
  ]){
    await assert.rejects(MimoPngResolution.verify(bad,300));
  }
  const blob=pngAt(160);
  await assert.rejects(MimoPngResolution.verify(blob,0),/invalid/);
  await assert.rejects(MimoPngResolution.verify(blob,601),/invalid/);
});

module.exports = {pngAt};
