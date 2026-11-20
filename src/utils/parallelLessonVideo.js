const RECORDINGS_DB = 'ivan100-parallel-videos';
const MEDIA_TYPES = [
  'video/webm;codecs=vp8,opus',
  'video/mp4;codecs=avc1.42001f,mp4a.40.2',
];

const requestResult = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export async function openParallelVideoStore() {
  const request = indexedDB.open(RECORDINGS_DB,1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore('recordings',{keyPath:'id'});
    request.result.createObjectStore('chunks',{keyPath:['id','index']});
  };
  const db = await requestResult(request);
  const write = (store,value) => new Promise((resolve,reject) => {
    const transaction = db.transaction(store,'readwrite');
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error);
    transaction.objectStore(store).put(value);
  });
  const range = id => IDBKeyRange.bound([id,0],[id,Number.MAX_SAFE_INTEGER]);
  return {
    close: () => db.close(),
    saveInfo: info => write('recordings',info),
    saveChunk: chunk => write('chunks',chunk),
    async list(teacherId) {
      const rows = await requestResult(db.transaction('recordings').objectStore('recordings').getAll());
      return rows.filter(row => row.teacherId === teacherId && row.hasVideo).sort((a,b) => b.startedAt - a.startedAt);
    },
    async file(info) {
      const rows = await requestResult(db.transaction('chunks').objectStore('chunks').getAll(range(info.id)));
      if (!rows.length) return null;
      const extension = info.mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
      return new File(rows.map(row => row.blob),`${info.name} · ${info.date}.${extension}`,{type:info.mimeType});
    },
  };
}

export function getParallelVideoMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  return MEDIA_TYPES.find(type => MediaRecorder.isTypeSupported(type)) || '';
}

function fitImage(ctx,source,box) {
  const width = source.videoWidth || source.width, height = source.videoHeight || source.height;
  if (!width || !height || (source.tagName === 'VIDEO' && source.readyState < 2)) return;
  const scale = Math.min(box.width / width,box.height / height);
  ctx.drawImage(source,box.x+(box.width-width*scale)/2,box.y+(box.height-height*scale)/2,width*scale,height*scale);
}

export function createParallelLessonVideo({store,audioContext,room,name,mimeType,teacherId,reportError}) {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');
  const destination = audioContext.createMediaStreamDestination();
  const mix = new Map(), pictures = new Map();
  const videoStream = canvas.captureStream(12);
  const [videoTrack] = videoStream.getVideoTracks();
  const stream = new MediaStream([videoTrack,...destination.stream.getAudioTracks()]);
  const recorder = new MediaRecorder(stream,{mimeType, videoBitsPerSecond:1_800_000,audioBitsPerSecond:96_000});
  const info = {id:crypto.randomUUID(),teacherId,name,mimeType:recorder.mimeType || mimeType,
    startedAt:Date.now(),date:new Date().toLocaleDateString('sv-SE')};
  let pending = Promise.resolve(), index = 0, timer, failed, ended, finishPromise;
  const stopped = new Promise(resolve => recorder.addEventListener('stop',resolve,{once:true}));
  let started = false;
  const fail = error => {
    if (failed) return;
    failed = error || new Error('Не удалось записать видео.');
    clearInterval(timer);
    timer = undefined;
    if (recorder.state !== 'inactive') recorder.stop();
    reportError(failed);
  };

  recorder.addEventListener('dataavailable',event => {
    if (!event.data.size) return;
    const chunk = {id:info.id,index:index++,blob:event.data};
    pending = pending.then(async () => {
      await store.saveChunk(chunk);
      if (chunk.index === 0) await store.saveInfo({...info,hasVideo:true});
    }).catch(fail);
  });
  recorder.addEventListener('error',event => fail(event.error));

  function updateAudio(tracks) {
    const activeTracks = new Set(tracks.filter(track => track?.readyState === 'live'));
    for (const [track,node] of mix) {
      if (activeTracks.has(track)) continue;
      node.disconnect();
      mix.delete(track);
    }
    for (const track of activeTracks) {
      if (mix.has(track)) continue;
      const node = audioContext.createMediaStreamSource(new MediaStream([track]));
      node.connect(destination);
      mix.set(track,node);
    }
  }

  function updatePictures(tracks) {
    const current = new Set(tracks.filter(track => track?.readyState === 'live' && track.enabled));
    for (const [track,video] of pictures) {
      if (current.has(track)) continue;
      video.srcObject = null;
      pictures.delete(track);
    }
    for (const track of current) {
      if (pictures.has(track)) continue;
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = new MediaStream([track]);
      void video.play().catch(() => {});
      pictures.set(track,video);
    }
  }

  function draw() {
    try {
      const media = room.readCall?.();
      updateAudio(media?.audio || []);
      const screen = media?.screen;
      const cameras = media?.cameras || [];
      updatePictures([screen,...cameras]);
      ctx.fillStyle = '#f6f4fc';
      ctx.fillRect(0,0,1280,720);
      ctx.fillStyle = '#241d35';
      ctx.font = '600 24px sans-serif';
      ctx.fillText(name,26,37,1228);
      const main = {x:24,y:53,width:1232,height:643};
      if (room.surface === 'board' && room.readBoard?.()) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(main.x,main.y,main.width,main.height);
        fitImage(ctx,room.readBoard(),main);
      } else if (room.surface === 'collab') {
        const code = room.readCode?.();
        ctx.font = '20px monospace';
        for (const [index,line] of (code?.lines || []).entries()) {
          ctx.fillText(`${String((code.firstLine || 1)+index).padStart(4)}  ${line}`,main.x+12,main.y+28+index*24,main.width-24);
        }
      } else if (pictures.has(screen)) {
        fitImage(ctx,pictures.get(screen),main);
      } else {
        const visible = cameras.filter(track => pictures.has(track));
        for (const [index,track] of visible.entries()) {
          const width = main.width/visible.length;
          fitImage(ctx,pictures.get(track),{...main,x:main.x+width*index,width});
        }
        if (!visible.length) {
          ctx.font = '20px sans-serif';
          ctx.fillText('Разговор',main.x+12,main.y+32);
        }
      }
      if ((room.surface === 'board' || room.surface === 'collab' || pictures.has(screen)) && pictures.has(media?.localCamera)) {
        const camera = {x:1030,y:570,width:208,height:116};
        ctx.fillStyle = '#231d31';
        ctx.fillRect(camera.x,camera.y,camera.width,camera.height);
        fitImage(ctx,pictures.get(media.localCamera),camera);
      }
      videoTrack.requestFrame?.();
    } catch (error) { fail(error); }
  }

  return {
    async prepare() {
      await store.saveInfo(info);
    },
    setActive(active) {
      if (ended || failed) return false;
      try {
        if (!active) {
          if (!timer) return false;
          clearInterval(timer);
          timer = undefined;
          if (recorder.state === 'recording') recorder.pause();
          return false;
        }
        if (timer) return true;
        if (recorder.state === 'inactive') {
          recorder.start(3000);
          started = true;
        } else if (recorder.state === 'paused') recorder.resume();
        draw();
        if (failed) return false;
        timer = setInterval(draw,1000/12);
        return true;
      } catch (error) {
        fail(error);
        return false;
      }
    },
    finish() {
      if (finishPromise) return finishPromise;
      ended = true;
      clearInterval(timer);
      finishPromise = (async () => {
        if (recorder.state !== 'inactive') recorder.stop();
        if (started) await stopped;
        updateAudio([]);
        updatePictures([]);
        stream.getTracks().forEach(track => track.stop());
        await pending;
        return store.file(info);
      })();
      return finishPromise;
    },
  };
}
