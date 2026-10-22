import { getStore } from '@netlify/blobs';
import { createPriceHandler } from '../lib/price-handler.mjs';

export default createPriceHandler(() => getStore({ name: 'the-gents-product-prices-v1', consistency: 'strong' }));
