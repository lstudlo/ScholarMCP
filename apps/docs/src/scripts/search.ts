import { searchRecords, type SearchRecord, type SearchResult } from '../lib/search';

let records: SearchRecord[] | null = null;
let loadingPromise: Promise<SearchRecord[]> | null = null;

const escapeHtml = (value: string): string => value
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const loadRecords = (): Promise<SearchRecord[]> => {
  if (records) return Promise.resolve(records);
  if (!loadingPromise) {
    loadingPromise = fetch('/search-index.json', { headers: { accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Search index request failed: ${response.status}`);
        records = await response.json() as SearchRecord[];
        return records;
      }).finally(() => { loadingPromise = null; });
  }
  return loadingPromise;
};

const renderResults = (container: HTMLElement, status: HTMLElement, items: SearchResult[], query: string) => {
  if (!query.trim()) {
    status.textContent = 'Start typing to search';
    container.innerHTML = '';
    return;
  }

  if (!items.length) {
    status.textContent = 'No results';
    container.innerHTML = `
      <div class="rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-300">
        No matches found for <span class="font-mono">${escapeHtml(query)}</span>.
      </div>
    `;
    return;
  }

  status.textContent = `${items.length} result${items.length === 1 ? '' : 's'}`;
  container.innerHTML = `
    <ul class="space-y-2">
      ${items
        .map((item) => {
          const headingHtml = item.matchedHeading
            ? `<p class="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Heading: ${escapeHtml(item.matchedHeading)}</p>`
            : '';

          return `
            <li>
              <a href="${escapeHtml(item.href)}" class="block rounded-2xl border border-zinc-200/80 bg-white/80 p-4 transition hover:border-zinc-900 hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/70 dark:hover:border-zinc-100 dark:hover:bg-zinc-950">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-[11px] tracking-[0.16em] text-zinc-500 uppercase">${escapeHtml(item.section || 'Documentation')}</p>
                    <p class="mt-1 font-serif text-2xl leading-tight tracking-tight">${escapeHtml(item.title)}</p>
                  </div>
                  <span class="shrink-0 rounded-full border border-zinc-300/80 px-2 py-0.5 text-[11px] font-mono text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">↵</span>
                </div>
                ${item.description ? `<p class="mt-2 line-clamp-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">${escapeHtml(item.description)}</p>` : ''}
                ${headingHtml}
              </a>
            </li>
          `;
        })
        .join('')}
    </ul>
  `;
};

const bindSearch = () => {
  const dialog = document.querySelector<HTMLDialogElement>('[data-search-modal]');
  const openButtons = Array.from(document.querySelectorAll('[data-open-search]'));
  const closeButton = dialog?.querySelector('[data-close-search]');
  const input = dialog?.querySelector<HTMLInputElement>('[data-search-input]');
  const results = dialog?.querySelector<HTMLElement>('[data-search-results]');
  const status = dialog?.querySelector<HTMLElement>('[data-search-status]');
  if (!dialog || !input || !results || !status || dialog.dataset.bound === 'true') return;
  dialog.dataset.bound = 'true';

  let activeQuery = '';

  const runSearch = async (query: string) => {
    activeQuery = query;
    if (!query.trim()) {
      renderResults(results, status, [], '');
      return;
    }

    status.textContent = 'Searching…';
    try {
      const index = await loadRecords();
      if (activeQuery !== query) return;
      const ranked = searchRecords(index, query);
      renderResults(results, status, ranked, query);
    } catch (error) {
      if (activeQuery !== query) return;
      status.textContent = 'Search unavailable';
      results.innerHTML = `
        <div class="rounded-2xl border border-red-200/70 bg-red-50/70 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          Failed to load the search index.
        </div>
      `;
      console.error(error);
    }
  };

  const open = async () => {
    if (!dialog.open) dialog.showModal();
    document.documentElement.classList.add('overflow-hidden');
    input.focus();
    input.select();
    if (!records) {
      status.textContent = 'Loading index…';
      try {
        await loadRecords();
        if (!input.value.trim()) status.textContent = 'Start typing to search';
      } catch {
        status.textContent = 'Search unavailable';
      }
    }
  };

  const close = () => {
    if (dialog.open) dialog.close();
    document.documentElement.classList.remove('overflow-hidden');
  };

  for (const button of openButtons) {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      open();
    });
  }

  closeButton?.addEventListener('click', close);

  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('overflow-hidden');
  });

  dialog.addEventListener('click', (event) => {
    const rect = dialog.getBoundingClientRect();
    const within =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    if (!within) close();
  });

  input.addEventListener('input', () => {
    runSearch(input.value);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      const firstLink = results.querySelector<HTMLAnchorElement>('a[href]');
      if (firstLink) {
        event.preventDefault();
        window.location.href = firstLink.href;
      }
    }
  });

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    const editable =
      target instanceof HTMLElement &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      open();
      return;
    }

    if (event.key === '/' && !editable && !dialog.open) {
      event.preventDefault();
      open();
    }

    if (event.key === 'Escape' && dialog.open) {
      close();
    }
  });
};


bindSearch();
