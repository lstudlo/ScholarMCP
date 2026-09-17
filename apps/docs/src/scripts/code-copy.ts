for (const pre of document.querySelectorAll<HTMLElement>('.prose-wrap pre')) {
  const code = pre.querySelector('code');
  if (!code || !navigator.clipboard?.writeText) continue;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'code-copy-btn';
  button.textContent = 'Copy';
  button.setAttribute('aria-label', 'Copy code block to clipboard');
  button.setAttribute('aria-live', 'polite');
  let resetTimer: number | undefined;

  button.addEventListener('click', async () => {
    clearTimeout(resetTimer);
    try {
      await navigator.clipboard.writeText(code.textContent ?? '');
      button.textContent = 'Copied';
      button.dataset.copied = 'true';
    } catch {
      button.textContent = 'Select and copy';
      button.dataset.copied = 'false';
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    resetTimer = window.setTimeout(() => {
      button.textContent = 'Copy';
      button.dataset.copied = 'false';
    }, 1400);
  });
  pre.append(button);
}
