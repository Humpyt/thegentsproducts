import { createPriceHandler } from '../lib/price-handler.mjs';
import { createSheetsStore } from '../lib/sheets-store.mjs';

export default createPriceHandler(() => createSheetsStore());
