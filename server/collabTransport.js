// Large initial Yjs states benefit from asynchronous zlib compression. Small
// cursor/ink messages stay uncompressed; context-free streams bound per-room
// memory and retain compatibility with clients that do not negotiate deflate.
export const collabTransportOptions = {
  noServer:true,
  maxPayload:8*1024*1024,
  perMessageDeflate:{
    threshold:4096,
    concurrencyLimit:2,
    serverNoContextTakeover:true,
    clientNoContextTakeover:true,
    zlibDeflateOptions:{level:1,memLevel:7},
  },
};
