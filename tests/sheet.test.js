// Tests de la lectura del full de Google Finance (servidor i client).
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import handler from '../api/sheet.js';
import {fetchSheetCsv, parseCsv, parseLocaleNumber, parseMultiple, parsePercent, parseSheet} from '../api/_sheet.js';
import {resetMemoryStore} from '../api/_ratelimit.js';
import {applySheetRow, createSheetLoader} from '../src/sheetLoader.js';

const HEADER = '"Ticker","Empresa","Moneda","Preu actual (moneda local)","Capitalització (moneda local)","Màxim 52 setmanes","Mínim 52 setmanes","Variació diària (%)","Moneda segons Google","PER (vegades)","Hora última cotització"';

/**
 * Construeix un CSV amb el format del full real.
 * @param {string[]} lines Files de dades.
 */
const csv = (lines) => [HEADER, ...lines].join('\n');

const ROWS = [
  '"BNP","BNP Paribas","EUR","91,93","101.215.101.653,00","113,82","65,12","(0,01) %","EUR","7,7x","06/11/2026 17:35"',
  '"NVDA","Nvidia, Corp","USD","1.188,07","4.546.344.602.966,00","1.243,37","164,27","3,81 %","USD","23,8x","06/11/2026 12:11"',
  '"BARC","Barclays","GBP","420,00","729.860.993,00","554,10","361,35","(0,94) %","GBX","8,4x","06/11/2026 16:48"',
  '"7203","Toyota","JPY","","","","","","","",""',
  '"0700","Tencent","HKD","419,80","","662,00","375,20","","USD","14,0x","06/11/2026 16:08"',
  '"FAKE","Inventada","USD","10,00","","","","","USD","",""',
  '"AAPL","Apple","USD","=HYPERLINK(""x"")","","","","","USD","",""',
  '"MSFT","Microsoft","USD","0,00","","","","","USD","",""',
  '"TTE","TotalEnergies","EUR","79,73","","50,00","85,94","1,00 %","EUR","","ahir"',
];

describe('formats numèrics del full', () => {
  it.each([
    ['91,93', 91.93], ['1.295,95', 1295.95], ['4.546.344.602.966,00', 4546344602966], ['420', 420],
    ['', null], ['1,295.95', null], ['12.34', null], ['abc', null], ['=1+1', null],
  ])('parseLocaleNumber(%j) → %j', (input, expected) => {
    expect(parseLocaleNumber(input)).toBe(expected);
  });

  it.each([['3,81 %', 3.81], ['(0,01) %', -0.01], ['(12,50) %', -12.5], ['', null], ['3,81', null]])(
    'parsePercent(%j) → %j', (input, expected) => { expect(parsePercent(input)).toBe(expected); },
  );

  it.each([['7,7x', 7.7], ['1.234,5x', 1234.5], ['', null], ['7,7', null]])(
    'parseMultiple(%j) → %j', (input, expected) => { expect(parseMultiple(input)).toBe(expected); },
  );

  it('parseCsv respecta les comes i les cometes dins dels camps', () => {
    expect(parseCsv('"a","b, c","d ""e"""\n"1","2","3"')).toEqual([['a', 'b, c', 'd "e"'], ['1', '2', '3']]);
  });
});

describe('parseSheet', () => {
  const {rows, stats} = parseSheet(csv(ROWS));

  it('converteix una fila vàlida', () => {
    expect(rows.BNP).toEqual({
      price: 91.93, high52: 113.82, low52: 65.12, changePct: -0.01, pe: 7.7, marketCapB: 101.22, time: '06/11/2026 17:35',
    });
    expect(rows.NVDA.price).toBe(1188.07);
  });

  it('passa de penics (GBX) a lliures (GBP) i descarta la capitalització', () => {
    expect(rows.BARC).toMatchObject({price: 4.2, high52: 5.541, low52: 3.6135, marketCapB: null});
  });

  it('descarta files sense preu, de moneda diferent, desconegudes o amb valors no vàlids', () => {
    expect(rows['7203']).toBeUndefined(); // sense preu
    expect(rows['0700']).toBeUndefined(); // HKD esperat, USD rebut
    expect(rows.FAKE).toBeUndefined(); // no és al catàleg
    expect(rows.AAPL).toBeUndefined(); // fórmula en lloc de nombre
    expect(rows.MSFT).toBeUndefined(); // preu zero
    expect(stats).toMatchObject({withPrice: 4, withoutPrice: 2});
    expect(stats.rejected).toEqual({'0700': 'CURRENCY_MISMATCH', FAKE: 'UNKNOWN_TICKER', MSFT: 'INVALID_PRICE'});
  });

  it('anul·la un rang anual incoherent i una hora sense format', () => {
    expect(rows.TTE).toMatchObject({price: 79.73, high52: null, low52: null, pe: null, time: null});
  });

  it('marca els símbols duplicats i no en fa servir cap', () => {
    const result = parseSheet(csv([ROWS[0], ROWS[0].replace('91,93', '1,00')]));
    expect(result.rows.BNP).toBeUndefined();
    expect(result.stats.rejected.BNP).toBe('DUPLICATE');
  });

  it('falla si el full ja no té les columnes esperades', () => {
    expect(() => parseSheet('"Ticker","Preu"\n"BNP","1,00"')).toThrow('SHEET_FORMAT_CHANGED');
  });
});

describe('fetchSheetCsv', () => {
  it('demana l\'exportació CSV sense seguir redireccions', async () => {
    const fetchImpl = vi.fn(async () => new Response(csv(ROWS), {headers: {'content-type': 'text/csv; charset=utf-8'}}));
    await fetchSheetCsv('1W_gFjoPao7ou8Qshs1G4lgdgG2l3o4BYtH-VvPVnEKc', fetchImpl);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://docs.google.com/spreadsheets/d/1W_gFjoPao7ou8Qshs1G4lgdgG2l3o4BYtH-VvPVnEKc/gviz/tq?tqx=out:csv');
    expect(options.redirect).toBe('manual');
  });

  it.each([
    ['un full privat (401)', new Response('<html>', {status: 401}), 'SHEET_NOT_PUBLIC'],
    ['una pàgina HTML', new Response('<html>', {status: 200, headers: {'content-type': 'text/html'}}), 'SHEET_UNAVAILABLE'],
  ])('detecta %s', async (_name, response, code) => {
    await expect(fetchSheetCsv('1W_gFjoPao7ou8Qshs1G4lgdgG2l3o4BYtH-VvPVnEKc', async () => response)).rejects.toThrow(code);
  });

  it('rebutja un identificador de full no vàlid sense fer cap petició', async () => {
    const fetchImpl = vi.fn();
    await expect(fetchSheetCsv('../../evil', fetchImpl)).rejects.toThrow('SHEET_NOT_CONFIGURED');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('handler /api/sheet', () => {
  /** Resposta simulada de Vercel. */
  function mockRes() {
    const res = {statusCode: 200, body: undefined, headers: {}};
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.body = body; return res; };
    res.setHeader = (name, value) => { res.headers[name.toLowerCase()] = value; };
    return res;
  }
  const req = (query = {}) => ({method: 'GET', query, headers: {'x-real-ip': '203.0.113.9'}});

  beforeEach(() => { resetMemoryStore(); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('retorna les files validades amb 10 minuts de memòria cau CDN', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(csv(ROWS), {headers: {'content-type': 'text/csv'}})));
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.body.rows).sort()).toEqual(['BARC', 'BNP', 'NVDA', 'TTE']);
    expect(res.headers['cache-control']).toContain('s-maxage=600');
  });

  it('no desa a la memòria cau un full privat', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', {status: 401})));
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(502);
    expect(res.body.error).toBe('SHEET_NOT_PUBLIC');
    expect(res.headers['cache-control']).toContain('no-store');
  });

  it('rebutja qualsevol paràmetre', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = mockRes();
    await handler(req({x: '1'}), res);
    expect(res.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('client: createSheetLoader i applySheetRow', () => {
  it('descarta files sense un preu numèric positiu', async () => {
    const body = {fetchedAt: '2026-11-06T17:00:00Z', rows: {BNP: {price: 91.93, high52: 113.82, low52: 65.12, changePct: -0.01, pe: 7.7, marketCapB: 101.22, time: '06/11/2026 17:35'}, X: {price: 'abc'}, Y: {price: -1}}};
    const loader = createSheetLoader({fetchImpl: async () => new Response(JSON.stringify(body))});
    const result = await loader.get();
    expect(Object.keys(result.rows)).toEqual(['BNP']);
  });

  it('substitueix els camps de preu, calcula la variació absoluta i manté el dividend', () => {
    const seed = {symbol: 'BNP', currency: 'EUR', price: 87.65, change: 0.45, high: 113.82, low: 65.12, yield: 6.62, pe: 9.16, mv: 97.89};
    const row = {price: 101, high52: 120, low52: 60, changePct: 1, pe: null, marketCapB: 100, time: '06/11/2026 17:35'};
    expect(applySheetRow(seed, row)).toEqual({
      symbol: 'BNP', currency: 'EUR', price: 101, change: 1, high: 120, low: 60, yield: 6.62, pe: null, mv: 100,
      source: 'sheet', sheetTime: '06/11/2026 17:35',
    });
    expect(applySheetRow(seed, undefined)).toBe(seed);
  });
});
