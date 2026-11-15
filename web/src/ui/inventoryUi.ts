import { h } from './dom';
import { itemDef } from '../inventory/items';
import type { Inventory } from '../inventory/inventory';

/** A grid of inventory cells; `onPick(index)` fires for occupied cells; `onHover` shows details. */
export function inventoryGrid(inv: Inventory, onPick: ((index: number) => void) | null, onHover?: (index: number) => void): HTMLElement {
  return h('div.grid', null, ...inv.slots.map((s, i) => {
    if (!s) return h('div.cell.void');
    const d = itemDef(s.id);
    return h('button.cell', {
      title: `${d.name}${d.stack > 1 ? ` ×${s.count}` : ''}`,
      'data-item': s.id,
      onclick: onPick ? () => onPick(i) : undefined,
      onmouseenter: onHover ? () => onHover(i) : undefined,
    }, h('span.nm', null, d.name), d.icon, d.stack > 1 ? h('span.c', null, String(s.count)) : null);
  }));
}

/**
 * Storage container screen (System F): suit inventory on the left, container on the right. Clicking a stack moves
 * it to the other side (as much as fits). Closes with E / Esc (handled by the game loop) or the button.
 */
export class StorageScreen {
  readonly el: HTMLElement;
  open = false;
  private title = '';

  constructor(parent: HTMLElement, private readonly onClose: () => void) {
    this.el = h('div.overlay.interactive.hidden');
    parent.append(this.el);
  }

  show(title: string, suit: Inventory, store: Inventory): void {
    this.title = title;
    this.open = true;
    this.el.classList.remove('hidden');
    this.render(suit, store);
  }

  close(): void {
    this.open = false;
    this.el.classList.add('hidden');
  }

  private render(suit: Inventory, store: Inventory): void {
    const move = (from: Inventory, to: Inventory) => (i: number) => {
      if (from.moveSlot(i, to) === 0) this.flash(to === store ? 'Container full.' : 'Suit inventory full.');
      this.render(suit, store);
    };
    this.el.replaceChildren(h('div.store.card', null,
      h('div.head', null, h('div.meta', { style: { fontSize: '12px', letterSpacing: '0.18em', color: 'var(--accent)' } }, 'STORAGE'), h('h2', null, this.title)),
      h('div.cols', null,
        h('div.col', null, h('h4', null, `SUIT INVENTORY · ${suit.slots.filter(Boolean).length}/${suit.capacity}`), inventoryGrid(suit, move(suit, store))),
        h('div.col', null, h('h4', null, `CONTAINER · ${store.slots.filter(Boolean).length}/${store.capacity}`), inventoryGrid(store, move(store, suit))),
      ),
      h('div.foot', null, 'Click a stack to move it.  ', h('kbd', null, 'E'), ' / ', h('kbd', null, 'Esc'), ' close  ',
        h('span.msg', { style: { color: 'var(--warn, #e0a050)', marginLeft: '12px' } })),
    ));
  }

  private flash(text: string): void {
    const m = this.el.querySelector('.msg');
    if (m) m.textContent = text;
  }

  /** For the close button / external close. */
  requestClose(): void { this.onClose(); }
}
