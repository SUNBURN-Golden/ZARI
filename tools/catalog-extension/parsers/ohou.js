// 오늘의집 (ohou.se, store.ohou.se). Page structure is read through the shared
// snapshot (structured data, spec rows, body text); only naming differs here.
export const ohou = {
  defaultBrand: '',
  cleanName: (text) => text.replace(/\s*[-|·]\s*오늘의집\s*$/, '').trim(),
};
