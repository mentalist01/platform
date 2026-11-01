// Multipart filenames may arrive as Latin-1 bytes containing UTF-8. Names
// already decoded by the helper or containing real Unicode stay unchanged.
export function preparedReferenceName(value){
  const name=String(value||'');
  if([...name].some(char=>char.codePointAt(0)>255))return name;
  try{return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(name,'latin1'));}catch{return name;}
}
