import { TRACEABILITY_PRODUCTS_KEY } from "./constants";
import { readJsonStorage, writeJsonStorage } from "./storage";

function normalizeProducts(rawProducts) {
  if (!Array.isArray(rawProducts)) {
    return [];
  }
  return rawProducts.filter((product) => product && product.id);
}

export function getLocalProducts() {
  return normalizeProducts(readJsonStorage(TRACEABILITY_PRODUCTS_KEY, []));
}

export function saveLocalProducts(products) {
  writeJsonStorage(TRACEABILITY_PRODUCTS_KEY, normalizeProducts(products));
}

function parseProductTime(product) {
  const time = Date.parse(product?.updated_at || "");
  return Number.isNaN(time) ? 0 : time;
}

function shouldReplaceProduct(existingProduct, incomingProduct) {
  return parseProductTime(incomingProduct) >= parseProductTime(existingProduct);
}

export function upsertLocalProduct(incomingProduct) {
  if (!incomingProduct?.id) {
    return getLocalProducts();
  }
  const products = getLocalProducts();
  const index = products.findIndex((item) => item.id === incomingProduct.id);
  if (index === -1) {
    products.unshift(incomingProduct);
  } else if (shouldReplaceProduct(products[index], incomingProduct)) {
    products[index] = { ...products[index], ...incomingProduct };
  }
  saveLocalProducts(products);
  return products;
}

export function applyServerProducts(products) {
  const incoming = normalizeProducts(products);
  let merged = getLocalProducts();
  incoming.forEach((product) => {
    merged = upsertLocalProduct(product);
  });
  return merged;
}

export function removeLocalProduct(productId) {
  if (!productId) {
    return getLocalProducts();
  }
  const products = getLocalProducts().filter((item) => item.id !== productId);
  saveLocalProducts(products);
  return products;
}

export function applyOptimisticAdd(payload, timestamp) {
  const product = {
    id: payload.product_id,
    product_code: payload.product_code,
    name: payload.name,
    batch_no: payload.batch_no,
    qr_code: payload.qr_code,
    metadata: payload.metadata || {},
    updated_at: timestamp,
    created_at: timestamp,
    local_only: true
  };
  return upsertLocalProduct(product);
}

export function applyOptimisticUpdate(payload, timestamp) {
  const currentProducts = getLocalProducts();
  const existing = currentProducts.find((product) => product.id === payload.product_id);
  if (!existing) {
    return currentProducts;
  }
  const updated = {
    ...existing,
    ...payload,
    id: payload.product_id,
    updated_at: timestamp,
    local_only: true
  };
  return upsertLocalProduct(updated);
}
