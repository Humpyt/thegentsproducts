import { createProductHandler } from '../lib/product-handler.mjs';
import { createProductStore } from '../lib/product-store.mjs';
export default createProductHandler(() => createProductStore());
