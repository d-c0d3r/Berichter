export async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
  }
  const previous = document.activeElement;
  const field = document.createElement('textarea');
  field.value = text;
  field.readOnly = true;
  field.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px';
  document.body.append(field);
  let ok = false;
  try {
    field.focus({
      preventScroll: true
    });
    field.select();
    field.setSelectionRange(0, text.length);
    ok = document.execCommand('copy');
  } catch {} finally {
    field.remove();
    if (previous instanceof HTMLElement) previous.focus({
      preventScroll: true
    });
  }
  return ok;
}
