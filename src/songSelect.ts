export interface SongOption {
  title: string;
  url: string;
  videoIds?: {
    beatId?: number;
    chordId?: number;
    repetitiveSegmentId?: number;
    lyricId?: number;
    lyricDiffId?: number;
  };
}

export function createSongSelectionUI(
  songs: SongOption[],
  onSelect: (song: SongOption) => void
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'song-select-root';
  wrap.innerHTML = `
    <div class="song-select-backdrop"></div>
    <div class="song-select-panel">
      <h2>Select a song</h2>
      <ul class="song-list"></ul>
    </div>
  `;

  const list = wrap.querySelector<HTMLUListElement>('.song-list')!;
  for (const s of songs) {
    const li = document.createElement('li');
    li.className = 'song-item';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'song-btn';
    btn.textContent = s.title;
    btn.addEventListener('click', () => onSelect(s));
    li.appendChild(btn);
    if (s.videoIds) {
      const meta = document.createElement('small');
      meta.className = 'song-meta';
      meta.textContent = Object.entries(s.videoIds)
        .map(([k, v]) => (v ? `${k}:${v}` : ''))
        .filter(Boolean)
        .join(' ');
      li.appendChild(meta);
    }
    list.appendChild(li);
  }

  // Minimal styles injected so you can see it immediately (move to CSS later)
  const style = document.createElement('style');
  style.textContent = `
    .song-select-root { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; z-index:10; pointer-events:none; }
    .song-select-root > * { pointer-events: auto; }
    .song-select-backdrop { position:absolute; inset:0; background:rgba(0,0,0,0.6); }
    .song-select-panel {
        position: relative;
        background: #0e0e18;
        color: #fff;
        padding: 20px;
        border-radius: 8px;
        width: min(100%, 420px);
        max-height: calc(100% - 40px);
        overflow-y: auto;
        box-shadow: 0 10px 30px rgba(0,0,0,0.6);
        }
    .song-list { list-style:none; margin:12px 0 0; padding:0; display:grid; gap:8px; }
    .song-item { display:flex; flex-direction:column; }
    .song-btn { background:#1a1a2e; color:#fff; border:1px solid #333; padding:10px 12px; border-radius:6px; cursor:pointer; text-align:left; }
    .song-btn:hover { background:#2a2a44; }
    .song-meta { color:#aaa; margin-top:4px; font-size:12px; }
  `;
  wrap.appendChild(style);

  return wrap;
}

export async function mountSongSelection(
  container: HTMLElement | null,
  songsArg?: SongOption[],
  onSelect?: (song: SongOption) => void
): Promise<HTMLElement> {
  let songs = songsArg;
  if (!songs) {
    const mod = await import('./songs');
    // songs.ts exports `songs` as named and default; handle both
    songs = (mod.default ?? mod.songs) as SongOption[];
  }

  const ui = createSongSelectionUI(songs, (s) => {
    const root = container?.querySelector('.song-select-root') ?? document.querySelector('.song-select-root');
    if (root && root.parentElement) root.parentElement.removeChild(root);
    onSelect?.(s);
  });

  if (container) {
    container.appendChild(ui);
  } else {
    document.body.appendChild(ui);
  }
  return ui;
}