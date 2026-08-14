'use client';

import { Plus } from 'lucide-react';
import { evaluateCollection } from '../lib/derived';
import type { LifeData } from '../lib/types';
import { Empty } from './LifeAppStable';

export function Venues({
  data,
  onModal,
}: {
  data: LifeData;
  onModal: (name: string) => void;
}) {
  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="section-kicker">Places</div>
            <h2>Venues &amp; Zoo mode</h2>
          </div>
          <button className="primary-btn" onClick={() => onModal('venue')}>
            <Plus size={15} /> Add venue
          </button>
        </div>

        {data.venues.map((venue) => {
          const observations = data.observations.filter((o) => o.venueId === venue.id);
          const visits = data.visits.filter((visit) => visit.venueId === venue.id);
          const speciesCount = new Set(observations.map((o) => o.taxonId)).size;

          return (
            <div className="entity-row" key={venue.id}>
              <div>
                <strong>{venue.name}</strong>
                <span>{venue.city || '—'} · {venue.country || '—'} · {venue.type}</span>
                <small>{speciesCount} species · {observations.length} observations · {visits.length} visits</small>
              </div>
              <button className="secondary-btn" onClick={() => onModal('visit')}>
                Start visit
              </button>
            </div>
          );
        })}

        {!data.venues.length && (
          <Empty text="No venues yet. Add a venue to enable Visit mode." />
        )}
      </section>
    </div>
  );
}

export function Collections({
  data,
  onModal,
  onDelete,
  onOpenTaxon,
}: {
  data: LifeData;
  onModal: (name: string) => void;
  onDelete: (id: string) => void;
  onOpenTaxon: (id: string) => void;
}) {
  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="section-kicker">Saved views</div>
            <h2>Collections</h2>
          </div>
          <button className="primary-btn" onClick={() => onModal('collection')}>
            <Plus size={15} /> New collection
          </button>
        </div>

        {data.collections.map((collection) => {
          const rows = evaluateCollection(data, collection);
          return (
            <div className="entity-row" key={collection.id}>
              <div>
                <strong>{collection.name}</strong>
                <span>{collection.description || 'Saved query definition'}</span>
                <small>{rows.length} species · live derived results</small>
              </div>
              <span className="row-actions">
                <button
                  className="secondary-btn"
                  disabled={!rows.length}
                  onClick={() => rows[0] && onOpenTaxon(rows[0].taxon.id)}
                >
                  Open
                </button>
                <button className="danger-btn" onClick={() => onDelete(collection.id)}>
                  Delete
                </button>
              </span>
            </div>
          );
        })}

        {!data.collections.length && (
          <Empty text="No collections yet. Save a query to create one." />
        )}
      </section>
    </div>
  );
}
