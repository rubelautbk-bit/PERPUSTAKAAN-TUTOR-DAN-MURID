// Simple i18n helper - loads JSON dictionaries once.
const id = require('../i18n/id.json');
const en = require('../i18n/en.json');

const dicts = { id, en };

function getNested(obj, key) {
  return key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
}

function interpolate(str, vars) {
  if (typeof str !== 'string') return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] !== undefined ? vars[k] : `{${k}}`));
}

// Create a `t` function bound to a specific language.
function createT(lang) {
  const primary = dicts[lang] || dicts.id;
  return function t(key, vars) {
    const val = getNested(primary, key);
    if (val !== undefined) return interpolate(val, vars);
    // Fallback to id
    const fallback = getNested(dicts.id, key);
    if (fallback !== undefined) return interpolate(fallback, vars);
    // Last resort: return the key itself so developers see what's missing.
    return key;
  };
}

function getSupportedLangs() {
  return Object.keys(dicts);
}

module.exports = { createT, getSupportedLangs };
