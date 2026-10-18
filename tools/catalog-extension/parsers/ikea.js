// IKEA 한국 (www.ikea.com/kr). The brand is the site itself.
export const ikea = {
  defaultBrand: 'IKEA',
  cleanName: (text) => text.replace(/\s*[-|·]\s*IKEA(?:\s*(?:한국|코리아))?\s*$/i, '').trim(),
};
