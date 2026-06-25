"use strict";
var ChromaDenoise = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/lib/engines/chroma-denoise.ts
  var chroma_denoise_exports = {};
  __export(chroma_denoise_exports, {
    CHROMA_POSTPASS_ENABLED: () => CHROMA_POSTPASS_ENABLED,
    DEFAULT_CHROMA_PARAMS: () => DEFAULT_CHROMA_PARAMS,
    MAX_CHROMA_POSTPASS_PIXELS: () => MAX_CHROMA_POSTPASS_PIXELS,
    denoiseChroma: () => denoiseChroma
  });
  var DEFAULT_CHROMA_PARAMS = {
    blurRadius: 3,
    maxStrength: 0.9,
    shadowCurve: 2.5
  };
  var MAX_CHROMA_POSTPASS_PIXELS = 12e6;
  var CHROMA_POSTPASS_ENABLED = false;
  var MAX_BLUR_RADIUS = 32;
  var Y_R = 0.299;
  var Y_G = 0.587;
  var Y_B = 0.114;
  var CB_R = -0.168736;
  var CB_G = -0.331264;
  var CB_B = 0.5;
  var CR_R = 0.5;
  var CR_G = -0.418688;
  var CR_B = -0.081312;
  var R_CR = 1.402;
  var G_CB = -0.344136;
  var G_CR = -0.714136;
  var B_CB = 1.772;
  var CHROMA_BIAS = 128;
  function maxInGamutScale(r, g, b, deltaR, deltaG, deltaB) {
    let scale = 1;
    if (deltaR > 0) {
      scale = Math.min(scale, (255 - r) / deltaR);
    } else if (deltaR < 0) {
      scale = Math.min(scale, -r / deltaR);
    }
    if (deltaG > 0) {
      scale = Math.min(scale, (255 - g) / deltaG);
    } else if (deltaG < 0) {
      scale = Math.min(scale, -g / deltaG);
    }
    if (deltaB > 0) {
      scale = Math.min(scale, (255 - b) / deltaB);
    } else if (deltaB < 0) {
      scale = Math.min(scale, -b / deltaB);
    }
    return Math.max(0, scale);
  }
  function boxBlurPlane(channel, scratch, width, height, radius) {
    const windowSize = radius * 2 + 1;
    for (let y = 0; y < height; y++) {
      const row = y * width;
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = k < 0 ? 0 : k >= width ? width - 1 : k;
        sum += channel[row + xx];
      }
      for (let x = 0; x < width; x++) {
        scratch[row + x] = Math.round(sum / windowSize);
        const outX = x - radius;
        const inX = x + radius + 1;
        const outIdx = outX < 0 ? 0 : outX;
        const inIdx = inX >= width ? width - 1 : inX;
        sum += channel[row + inIdx] - channel[row + outIdx];
      }
    }
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = k < 0 ? 0 : k >= height ? height - 1 : k;
        sum += scratch[yy * width + x];
      }
      for (let y = 0; y < height; y++) {
        channel[y * width + x] = Math.round(sum / windowSize);
        const outY = y - radius;
        const inY = y + radius + 1;
        const outIdx = outY < 0 ? 0 : outY;
        const inIdx = inY >= height ? height - 1 : inY;
        sum += scratch[inIdx * width + x] - scratch[outIdx * width + x];
      }
    }
  }
  function denoiseChroma(data, width, height, params = DEFAULT_CHROMA_PARAMS) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new RangeError(`chroma-denoise: invalid dimensions ${String(width)}\xD7${String(height)}.`);
    }
    const pixelCount = width * height;
    if (pixelCount > MAX_CHROMA_POSTPASS_PIXELS) {
      throw new RangeError(
        `chroma-denoise: ${String(pixelCount)}px exceeds the ${String(MAX_CHROMA_POSTPASS_PIXELS)}px (12 MP) limit.`
      );
    }
    if (data.length !== pixelCount * 4) {
      throw new RangeError(
        `chroma-denoise: buffer length ${String(data.length)} does not match ${String(width)}\xD7${String(height)}\xD74 (${String(pixelCount * 4)}).`
      );
    }
    const { blurRadius, maxStrength, shadowCurve } = params;
    if (!Number.isInteger(blurRadius) || blurRadius < 0 || blurRadius > MAX_BLUR_RADIUS) {
      throw new RangeError(`chroma-denoise: blurRadius must be an integer between 0 and ${String(MAX_BLUR_RADIUS)}.`);
    }
    if (!Number.isFinite(maxStrength) || maxStrength < 0 || maxStrength > 1) {
      throw new RangeError("chroma-denoise: maxStrength must be a finite number between 0 and 1.");
    }
    if (!Number.isFinite(shadowCurve) || shadowCurve <= 0) {
      throw new RangeError("chroma-denoise: shadowCurve must be a finite number greater than 0.");
    }
    const cb = new Uint8ClampedArray(pixelCount);
    const cr = new Uint8ClampedArray(pixelCount);
    const scratch = new Uint8ClampedArray(pixelCount);
    for (let p = 0, i = 0; p < pixelCount; p++, i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      cb[p] = CB_R * r + CB_G * g + CB_B * b + CHROMA_BIAS;
      cr[p] = CR_R * r + CR_G * g + CR_B * b + CHROMA_BIAS;
    }
    if (blurRadius > 0) {
      boxBlurPlane(cb, scratch, width, height, blurRadius);
      boxBlurPlane(cr, scratch, width, height, blurRadius);
    }
    const weightLut = new Float32Array(256);
    for (let yy = 0; yy < 256; yy++) {
      weightLut[yy] = maxStrength * Math.pow(1 - yy / 255, shadowCurve);
    }
    for (let p = 0, i = 0; p < pixelCount; p++, i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const yLuma = Y_R * r + Y_G * g + Y_B * b;
      const origCb = CB_R * r + CB_G * g + CB_B * b + CHROMA_BIAS;
      const origCr = CR_R * r + CR_G * g + CR_B * b + CHROMA_BIAS;
      const w = weightLut[Math.round(yLuma)];
      const deltaCb = (cb[p] - origCb) * w;
      const deltaCr = (cr[p] - origCr) * w;
      const deltaR = R_CR * deltaCr;
      const deltaG = G_CB * deltaCb + G_CR * deltaCr;
      const deltaB = B_CB * deltaCb;
      const scale = maxInGamutScale(r, g, b, deltaR, deltaG, deltaB);
      data[i] = r + deltaR * scale;
      data[i + 1] = g + deltaG * scale;
      data[i + 2] = b + deltaB * scale;
    }
  }
  return __toCommonJS(chroma_denoise_exports);
})();
