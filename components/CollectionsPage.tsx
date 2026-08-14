import { Plus } from 'lucide-react';
import { evaluateCollection } from '../lib/derived';
import type { LifeData } from '../lib/types';
export function Collections({ data, onModal, onDelete, onOpenTaxon }: { data: LifeData; onModal: (name: string) => void; onDelete: (id: string) => void; onOpenTaxon: (id: string) => void }) {
  return <div className='page-stack'><section className='panel'><div className='panel-head'><div><div className='section-kicker'>Saved views</div><h2>Collections</h2></div><button className='primary-btn' onClick={() => onModal('collection')}><Plus size={15}/> New collection</button></div>{data.collections.map((c) => { const rows = evaluateCollection(data, c); return <div className='entity-row' key={c.id}><div><strong>{c.name}</strong><span>{c.description || 'Saved query'}</span><small>{rows.length} species · live results</small></div><span className='row-actions'><button className='secondary-btn' onClick={() => rows[0] && onOpenTaxon(rows[0].taxon.id)}>Open</button><button className='danger-btn' onClick={() => onDelete(c.id)}>Delete</button></span></div>; })}</section></div>;
}
