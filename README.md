# Life

Life is a local-first species life-list tracker. It is designed around the loop **Species → Observation → Life List**.

## V1

- Personal life list derived from observations
- Fast observation logging optimised for zoo visits
- Reusable locations/venues
- Species search across common/scientific name, genus and family
- Life-list filtering and sorting
- Species detail pages with observation history and taxonomy
- Basic statistics
- CSV observation export/import
- JSON backup
- Responsive desktop/mobile UI
- No account, no server database and no authentication: records are stored in browser localStorage

## Running

```bash
npm install
npm run dev
```

Then open the local URL shown by Next.js.

## Data model

Species are static reference data. Observations are the source of truth for the life list. A species appears on the life list whenever at least one observation exists for it. Deleting the only observation removes that species from the life list automatically.

## Local storage

All personal records are stored under the `life:v1` localStorage key. Use **Import / export** to keep portable backups.
