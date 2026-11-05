// Text specifications only. No model inference, no image reading.
import { storageDimensionLines } from './storage.js';
export const daiso = {
  defaultBrand: '다이소',
  cleanName: (text) => text.replace(/\s*[|·-]\s*(?:MUJI|무인양품|다이소몰)\s*$/i, '').trim(),
  dimensionLines: storageDimensionLines,
};
