export const MEDIA_DB='life-media';
export const MEDIA_STORE='files';
export function openMediaDb():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open(MEDIA_DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(MEDIA_STORE,{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function putMedia(id:string,blob:Blob){const db=await openMediaDb();await new Promise<void>((res,rej)=>{const tx=db.transaction(MEDIA_STORE,'readwrite');tx.objectStore(MEDIA_STORE).put({id,blob});tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
