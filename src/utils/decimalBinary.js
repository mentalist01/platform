export const DECIMAL_BINARY_CARD='decimal-to-binary-v1';
export const BINARY_INPUT_LIMIT=80;

// Octets stay aligned to eight bits; a standalone integer may be larger.
// BigInt avoids rounding the input before conversion.
export function decimalBinary(value) {
  if(typeof value!=='string'||value.length>BINARY_INPUT_LIMIT)return null;
  const text=value.trim();
  if(/^\d+$/.test(text))return [BigInt(text).toString(2).padStart(8,'0')];
  const octets=text.split('.').map(octet=>octet.trim());
  if(octets.length!==4||octets.some(octet=>!/^\d{1,3}$/.test(octet)||Number(octet)>255))return null;
  return octets.map(octet=>Number(octet).toString(2).padStart(8,'0'));
}

export function normalizeDecimalBinaryParams(input={}) {
  const value=input.value??'252';
  if(value!==''&&!decimalBinary(value))throw Error('Укажите целое неотрицательное число или IPv4-адрес');
  return {value};
}
