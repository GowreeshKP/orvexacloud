
import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import type { CropAspect } from '@orvexa/theme';
import { api, type StockPhoto } from './api';

const ORIENTATION: Record<CropAspect, 'landscape' | 'portrait' | 'square' | undefined> = { wide: 'landscape', landscape: 'landscape', portrait: 'portrait', square: 'square', free: undefined };

/** Search Pexels and copy the chosen photo into the store's own storage. */
export function StockPicker({ initialQuery, aspect, onClose, onPicked }: {
  initialQuery: string; aspect: CropAspect; onClose: () => void; onPicked: (photo: { url: string; alt: string }) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [photos, setPhotos] = useState<StockPhoto[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<number | 'search' | null>(null);

  async function search(q: string) {
    setBusy('search');
    setError('');
    try {
      setPhotos((await api.stockSearch(q, ORIENTATION[aspect])).photos);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed.');
    } finally {
      setBusy(null);
    }
  }
  useEffect(() => { void search(initialQuery); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function pick(photo: StockPhoto) {
    setBusy(photo.id);
    try {
      const imported = await api.stockImport(photo.id);
      onPicked({ url: imported.url, alt: imported.alt || photo.alt });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The photo could not be added.');
      setBusy(null);
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="stock-title">
      <div className="modal__panel modal__panel--wide">
        <header className="modal__head">
          <div>
            <h2 id="stock-title">Stock photos</h2>
            <p>Free to use on your store. <a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer">Photos provided by Pexels</a></p>
          </div>
          <button type="button" className="btn" onClick={onClose}>Close</button>
        </header>
        <div className="modal__scroll">
          <form className="stock-search" onSubmit={(e) => { e.preventDefault(); void search(query); }}>
            <label htmlFor="stock-q" className="sr-only">Search photos</label>
            <input id="stock-q" type="search" value={query} maxLength={100} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. silk saree, spices, ceramic vase" />
            <button type="submit" className="btn btn--primary" disabled={busy === 'search' || query.trim().length < 2}><Search size={15} aria-hidden="true" /> Search</button>
          </form>
          {error && <p className="form-error" role="alert">{error}</p>}
          {busy === 'search' && <p>Searching…</p>}
          {photos && photos.length === 0 && <p>No photos found. Try simpler words.</p>}
          <ul className="stock-grid">
            {photos?.map((photo) => (
              <li key={photo.id}>
                <button type="button" className="stock-grid__pick" onClick={() => void pick(photo)} disabled={busy !== null} aria-label={`Use photo: ${photo.alt || 'stock photo'} by ${photo.photographer}`}>
                  <img src={photo.preview} alt="" loading="lazy" />
                  {busy === photo.id && <span className="stock-grid__busy">Adding…</span>}
                </button>
                <a className="stock-grid__credit" href={photo.photographerUrl} target="_blank" rel="noopener noreferrer">Photo by {photo.photographer}</a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
