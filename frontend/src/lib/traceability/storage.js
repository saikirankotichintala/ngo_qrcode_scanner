export function readJsonStorage(key, fallbackValue) {
  try {
    const rawValue = window.localStorage.getItem(key);
    if (!rawValue) {
      return fallbackValue;
    }
    return JSON.parse(rawValue);
  } catch (error) {
    return fallbackValue;
  }
}

export function writeJsonStorage(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}
