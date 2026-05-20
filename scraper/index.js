require('dotenv').config();
const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');

const DRY_RUN = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
const parser  = new XMLParser({ ignoreAttributes: false });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADZUNA_APP_ID  = process.env.ADZUNA_APP_ID  || '9855a269';
const ADZUNA_APP_KEY = process.env.ADZUNA_APP_KEY || 'd59961ec9e59e7767d380b082835e672';

const SUPA_HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

const CIDADES = [
  { nome: 'Curitiba',       uf: 'PR', indeed: 'Curitiba,+PR',       adzuna: 'Curitiba' },
  { nome: 'Ponta Grossa',   uf: 'PR', indeed: 'Ponta+Grossa,+PR',   adzuna: 'Ponta Grossa' },
  { nome: 'Joinville',      uf: 'SC', indeed: 'Joinville,+SC',       adzuna: 'Joinville' },
  { nome: 'Jaraguá do Sul', uf: 'SC', indeed: 'Jaragua+do+Sul,+SC', adzuna: 'Jaraguá do Sul' },
  { nome: 'Blumenau',       uf: 'SC', indeed: 'Blumenau,+SC',        adzuna: 'Blumenau' },
  { nome: 'Florianópolis',  uf: 'SC', indeed: 'Florianopolis,+SC',   adzuna: 'Florianópolis' },
  { nome: 'Criciúma',       uf: 'SC', indeed: 'Criciuma,+SC',        adzuna: 'Criciúma' },
];

const TERMOS = [
  'porteiro','zelador','auxiliar administrativo','cuidador','eletricista',
  'pedreiro','pintor','encanador','jardineiro','recepcionista',
  'motorista','vendedor','operador de caixa','técnico de manutenção','enfermeiro',
];

const BROWSER = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9',
};

async function scraperIndeed(cidade, termo) {
  const url = `https://br.indeed.com/rss?q=${encodeURIComponent(termo)}&l=${cidade.indeed}&sort=date&radius=30`;
  try {
    const { data } = await axios.get(url, { headers: BROWSER, timeout: 15000 });
    const items = parser.parse(data)?.rss?.channel?.item || [];
    return (Array.isArray(items) ? items : [items]).map(item => ({
      titulo: limpar(item.title || ''),
      empresa: limpar(item.source?.['#text'] || item.source || 'Não informado'),
      cidade: cidade.nome, uf: cidade.uf,
      descricao: limpar((item.description || '').replace(/<[^>]+>/g, '')).slice(0, 500),
      link: item.link || '',
      fonte: 'indeed',
      data_publicacao: item.pubDate ? new Date(item.pubDate).toISOString().slice(0, 10) : hoje(),
      hash: gerarHash('i' + (item.title || '') + cidade.nome + (item.link || '')),
    })).filter(v => v.titulo && v.link);
  } catch (e) { console.error(`  [Indeed] ${cidade.nome}/${termo}: ${e.message}`); return []; }
}

async function scraperAdzuna(cidade, termo) {
  const url = `https://api.adzuna.com/v1/api/jobs/br/search/1?app_id=${ADZUNA_APP_ID}&app_key=${ADZUNA_APP_KEY}&results_per_page=50&what=${encodeURIComponent(termo)}&where=${encodeURIComponent(cidade.adzuna)}&content-type=application/json`;
  try {
    const { data } = await axios.get(url, { timeout: 15000 });
    return (data.results || []).map(job => ({
      titulo: limpar(job.title || ''),
      empresa: limpar(job.company?.display_name || 'Não informado'),
      cidade: cidade.nome, uf: cidade.uf,
      descricao: limpar((job.description || '').slice(0, 500)),
      link: job.redirect_url || '',
      fonte: 'adzuna',
      data_publicacao: job.created ? job.created.slice(0, 10) : hoje(),
      hash: gerarHash('a' + (job.id || job.redirect_url || '') + cidade.nome),
    })).filter(v => v.titulo && v.link);
  } catch (e) { console.error(`  [Adzuna] ${cidade.nome}/${termo}: ${e.message}`); return []; }
}

async function salvarVagas(vagas) {
  if (!vagas.length) return 0;
  if (DRY_RUN) { console.log(`  [DRY-RUN] ${vagas.length} vagas`); return vagas.length; }
  try {
    await axios.post(`${SUPABASE_URL}/rest/v1/vagas`, vagas, {
      headers: { ...SUPA_HEADERS, 'Prefer': 'resolution=ignore-duplicates,return=minimal' }
    });
    return vagas.length;
  } catch (e) { console.error('  [Supabase]', e.response?.data || e.message); return 0; }
}

async function limparAntigas() {
  const d = new Date(); d.setDate(d.getDate() - 60);
  try {
    await axios.delete(`${SUPABASE_URL}/rest/v1/vagas?data_publicacao=lt.${d.toISOString().slice(0,10)}`, { headers: SUPA_HEADERS });
    console.log('Vagas antigas removidas');
  } catch (e) { console.error('  [limpeza]', e.message); }
}

function limpar(s = '') { return s.replace(/\s+/g, ' ').replace(/[^\w\sÀ-ú/&.,():;!?°%-]/g, '').trim(); }
function hoje() { return new Date().toISOString().slice(0, 10); }
function gerarHash(s) { let h=0; for(let i=0;i<s.length;i++) h=Math.imul(31,h)+s.charCodeAt(i)|0; return Math.abs(h).toString(36); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log(`\nVagasSul Scraper — ${new Date().toLocaleString('pt-BR')} ${DRY_RUN?'[DRY-RUN]':''}`);
  let total = 0, adzunaReqs = 0;
  for (const cidade of CIDADES) {
    console.log(`\n${cidade.nome} / ${cidade.uf}`);
    const vagas = [];
    for (const termo of TERMOS) {
      vagas.push(...await scraperIndeed(cidade, termo));
      await sleep(600);
      if (adzunaReqs < 200) { vagas.push(...await scraperAdzuna(cidade, termo)); adzunaReqs++; await sleep(400); }
    }
    const unicos = [...new Map(vagas.map(v => [v.hash, v])).values()];
    console.log(`  ${unicos.length} vagas únicas`);
    total += await salvarVagas(unicos);
    await sleep(1200);
  }
  if (!DRY_RUN) await limparAntigas();
  console.log(`\nConcluído — ${total} vagas processadas`);
}

main().catch(console.error);
