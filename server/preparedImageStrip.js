import sharp from 'sharp';
import fs from 'node:fs';
import {imageStripGeometry} from '../src/utils/imageStrip.js';

export async function removeImageStrip(buffer,selection) {
  const image=sharp(buffer,{limitInputPixels:40_000_000}),info=await image.metadata();
  const geometry=imageStripGeometry(info.width,info.height,selection?.top,selection?.bottom);
  if(!geometry)throw Object.assign(new Error('Выделите полосу внутри картинки. Сверху и снизу должен остаться текст.'),{status:400});
  const {width,topHeight,bottomHeight,to,outputHeight}=geometry;
  const [top,bottom]=await Promise.all([
    image.clone().extract({left:0,top:0,width,height:topHeight}).png().toBuffer(),
    image.clone().extract({left:0,top:to,width,height:bottomHeight}).png().toBuffer(),
  ]);
  const result=await sharp({create:{width,height:outputHeight,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
    .composite([{input:top,left:0,top:0},{input:bottom,left:0,top:topHeight}]).png().toBuffer();
  return {buffer:result,width,height:outputHeight};
}
const staff=auth=>['teacher','admin'].includes(auth?.role);
export function registerPreparedImageStripRoutes(app,store) {
  const owner=(req)=>{
    const asset=store.data.assets[req.params.id];
    if(!staff(req.auth)||!asset||asset.teacherId!==req.auth.id||!asset.mime.startsWith('image/'))
      throw Object.assign(new Error('Изображение не найдено'),{status:404});
    return asset;
  };
  const route=fn=>async(req,res)=>{
    res.set('Cache-Control','private, no-store');res.vary('Authorization');
    try{await fn(req,res);}catch(error){res.status(error.status||500).json({error:error.status?error.message:'Не удалось вырезать полосу. Исходная картинка сохранена.'});}
  };
  app.get('/api/lesson-task-images/:id/edit',route((req,res)=>{
    const asset=owner(req),view=id=>{const row=store.data.assets[id];return row?.teacherId===req.auth.id&&row.mime.startsWith('image/')?store.assetView(id):null;};
    res.json({asset:store.assetView(asset.id),previous:asset.stripParentId?view(asset.stripParentId):null,original:asset.stripOriginalId?view(asset.stripOriginalId):null});
  }));
  app.post('/api/lesson-task-images/:id/remove-strip',route(async(req,res)=>{
    const original=owner(req);
    const asset=await store.lock(async()=>{
      const result=await removeImageStrip(fs.readFileSync(store.assetFile(original)),req.body);
      return store.putAsset(req.auth,result.buffer,original.name,'image/png',{
        width:result.width,height:result.height,stripParentId:original.id,stripOriginalId:original.stripOriginalId||original.id,
      });
    });
    res.json(store.assetView(asset.id));
  }));
}
