// Limitador de peticions per a les funcions de servidor. No és una ruta pública:
// Vercel ignora els fitxers de /api que comencen per "_".
//
// Fa servir finestres fixes: la clau inclou l'índex de la finestra
// (p. ex. minut o dia UTC), de manera que el reinici és previsible i el
// càlcul de Retry-After és exacte.
//
// Emmagatzematge:
//  - Si hi ha Upstash Redis configurat (UPSTASH_REDIS_REST_URL/TOKEN o les
//    variables KV_REST_API_URL/TOKEN que crea la integració de Vercel), el
//    comptador és compartit entre totes les instàncies. És l'opció recomanada
//    en producció.
//  - Si no, es fa servir memòria local. És només una protecció parcial:
//    cada instància serverless té el seu propi comptador.
//  - Si Redis falla, es passa a memòria local (no es bloqueja el servei).
import {createHash} from 'node:crypto';

/**
 * @typedef {object} RateRule
 * @property {string} name Nom curt de la regla (forma part de la clau).
 * @property {number} limit Nombre màxim de peticions per finestra.
 * @property {number} windowSeconds Durada de la finestra en segons.
 */

/**
 * @typedef {object} RateResult
 * @property {boolean} allowed Cert si la petició es pot atendre.
 * @property {number} remaining Peticions restants en la finestra actual.
 * @property {number} retryAfter Segons fins al reinici de la finestra.
 * @property {'redis'|'memory'} store Emmagatzematge utilitzat.
 */

const MEMORY_MAX_KEYS = 10000;
const REDIS_TIMEOUT_MS = 1500;

/** @type {Map<string, {count: number, expiresAt: number}>} */
const memory = new Map();

/** Buida el comptador en memòria. Només per a tests. */
export function resetMemoryStore() {
  memory.clear();
}

/**
 * Llegeix la configuració de Redis de l'entorn en temps d'execució.
 * @returns {{url: string, token: string} | null}
 */
function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? {url: url.replace(/\/+$/, ''), token} : null;
}

/**
 * Elimina entrades caducades quan el mapa creix massa, per evitar fuites de memòria
 * si arriben peticions des de moltes IP diferents.
 * @param {number} now Marca temporal en ms.
 */
function pruneMemory(now) {
  if (memory.size < MEMORY_MAX_KEYS) return;
  for (const [key, entry] of memory) {
    if (entry.expiresAt <= now) memory.delete(key);
  }
  // Si encara és ple (atac amb moltes IP), es descarten les claus més antigues.
  while (memory.size >= MEMORY_MAX_KEYS) {
    memory.delete(memory.keys().next().value);
  }
}

/**
 * Incrementa un comptador en memòria.
 * @param {string} key Clau de la finestra.
 * @param {number} expiresAt Moment de caducitat en ms.
 * @param {number} now Marca temporal en ms.
 * @returns {number} Valor del comptador després d'incrementar.
 */
function memoryIncrement(key, expiresAt, now) {
  pruneMemory(now);
  const entry = memory.get(key);
  if (!entry || entry.expiresAt <= now) {
    memory.set(key, {count: 1, expiresAt});
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

/**
 * Incrementa un comptador a Upstash Redis amb una sola crida (pipeline REST).
 * @param {{url: string, token: string}} config Connexió a Redis.
 * @param {string} key Clau de la finestra.
 * @param {number} ttlSeconds Temps de vida de la clau.
 * @returns {Promise<number>} Valor del comptador després d'incrementar.
 * @throws {Error} Si Redis no respon correctament.
 */
async function redisIncrement(config, key, ttlSeconds) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REDIS_TIMEOUT_MS);
  try {
    const response = await fetch(config.url + '/pipeline', {
      method: 'POST',
      headers: {Authorization: 'Bearer ' + config.token, 'Content-Type': 'application/json'},
      body: JSON.stringify([['INCR', key], ['EXPIRE', key, String(ttlSeconds)]]),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('REDIS_HTTP_' + response.status);
    const data = await response.json();
    const count = Number(data?.[0]?.result);
    if (!Number.isInteger(count) || count < 1) throw new Error('REDIS_INVALID_RESPONSE');
    return count;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Converteix un identificador (p. ex. una IP) en un hash curt, per no desar
 * adreces IP en clar a Redis.
 * @param {string} identity Identificador original.
 * @returns {string} Hash hexadecimal de 16 caràcters.
 */
export function hashIdentity(identity) {
  return createHash('sha256').update(String(identity)).digest('hex').slice(0, 16);
}

/**
 * Consumeix una unitat de la regla indicada per a una identitat.
 * @param {RateRule} rule Regla a aplicar.
 * @param {string} identity Identitat (IP en hash, o "global").
 * @param {number} [now] Marca temporal en ms (injectable per a tests).
 * @returns {Promise<RateResult>} Resultat de la comprovació.
 */
export async function consume(rule, identity, now = Date.now()) {
  const windowMs = rule.windowSeconds * 1000;
  const index = Math.floor(now / windowMs);
  const expiresAt = (index + 1) * windowMs;
  const retryAfter = Math.max(1, Math.ceil((expiresAt - now) / 1000));
  const key = `t27:rl:${rule.name}:${identity}:${index}`;

  let count;
  let store = 'memory';
  const config = redisConfig();
  if (config) {
    try {
      count = await redisIncrement(config, key, rule.windowSeconds + 5);
      store = 'redis';
    } catch (e) {
      // Fail-open controlat: si Redis falla, es manté almenys el límit local.
      console.warn('[rate-limit] Redis no disponible, s\'usa memòria local:', e.message);
    }
  }
  if (count === undefined) count = memoryIncrement(key, expiresAt, now);

  return {allowed: count <= rule.limit, remaining: Math.max(0, rule.limit - count), retryAfter, store};
}

/**
 * Llegeix un enter positiu d'una variable d'entorn, amb valor per defecte.
 * @param {string} name Nom de la variable.
 * @param {number} fallback Valor per defecte.
 * @returns {number} Enter positiu.
 */
export function envLimit(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/**
 * Obté la IP del client. A Vercel, `x-vercel-forwarded-for` i `x-real-ip`
 * els fixa la mateixa plataforma i el client no els pot falsificar.
 * @param {{headers?: Record<string, string | string[] | undefined>, socket?: {remoteAddress?: string}}} req Petició.
 * @returns {string} Adreça IP o "unknown".
 */
export function clientIp(req) {
  const headers = req.headers || {};
  const first = (value) => String(Array.isArray(value) ? value[0] : value || '').split(',')[0].trim();
  return first(headers['x-vercel-forwarded-for']) || first(headers['x-real-ip']) ||
    first(headers['x-forwarded-for']) || req.socket?.remoteAddress || 'unknown';
}
