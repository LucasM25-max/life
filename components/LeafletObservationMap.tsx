'use client';
import dynamic from 'next/dynamic';import 'leaflet/dist/leaflet.css';
const Inner=dynamic(()=>import('./LeafletObservationMapInner'),{ssr:false,loading:()=> <div className='map-frame'><div style={{padding:24}}>Loading map…</div></div>});
export default function LeafletObservationMap({points}:{points:Array<{id:string,lat:number,lon:number,name:string,date:string}>}){return <Inner points={points}/>}
