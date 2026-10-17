// Board id → the app state that board shows. clock: the board's time (canvas.json title); until: how much of the Hera log
// (tools/render/hera.ts) has happened. type: values typed into the open sheet's inputs, in page order. Add boards here as the loop reaches them.
export const STATES = {
  '103-Decks': { clock: '15:04', until: '23:59', tab: 'decks' },
  '201-Log-Hourly': { clock: '15:04', until: '23:59', log: true, type: ['158', '70', '100', '52', '6'] },
  '903-Night': { clock: '15:04', until: '23:59', theme: 'night' },
};
