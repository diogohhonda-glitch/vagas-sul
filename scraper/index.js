require('dotenv').config();
const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');
const { createClient } = require('@supabase/supabase-js');

const DRY_RUN = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const parser = new XMLParser({ ignoreAttributes: false });

const ADZUNA_APP_ID  = process.env.ADZUNA_APP_ID  || '9855a269';
const ADZUNA_APP_KEY = process.env.ADZUNA_APP_KEY || 'd59961ec9e59e7767d380b082835e672';

const CIDADES = [
  { nome: 'Curitiba',         uf: 'PR', indeed: 'Curitiba,+PR',          adzuna: 'Curitiba' },
  { nome: 'Ponta Grossa',     uf: 'PR', indeed: 'Ponta+Grossa,+PR',      adzuna: 'Ponta Grossa' },
  { nome: 'Joinville',        uf: 'SC', indeed: 'Joinville,+SC',          adzuna: 'Joinville' },
  { nome: 'Jaraguá do Sul',   uf: 'SC', indeed: 'Jaragua+do+Sul,+SC',    adzuna: 'Jaraguá do Sul' },
  { nome: 'Blumenau',         uf: 'SC', indeed: 'Blumenau,+SC',           adzuna: 'Blumenau' },
  { nome: 'Florianópolis',    uf: 'SC', indeed: 'Florianopolis,+SC',      adzuna: 'Florianópolis' },
  { nome: 'Criciúma',         uf: 'SC', indeed: 'Criciuma,+SC',           adzuna: 'Criciúma' },
];

const TERMOS = [
  'porteiro', 'zelador', 'auxiliar administrativo', 'cuidador', 'eletricista',
  'pedreiro', 'pintor', 'encanador', 'jardineiro', 'recepcionista',
  'motorista', 'vendedor', 'operador de caixa', 'técnico de manutenção', 'enfermeiro',
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9',
};

// ── Indeed RSS (sem limite, sem chave) ─────────────────────────────────────────
async function scraperIndeed(cidade, termo) {
  const url = `https://br.indeed.com/rss?q=${encodeURIComponent(termo)}&l=${cidade.indeed}&sort=date&radius=30`;
  try {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 15000 });
    const parsed = parser.parse(data);
    const items = parsed?.rss?.channel?.item || [];
    return (Array.isArray(items) ? items : [items])
      .map(item => ({
        titulo:          limpar(item.title || ''),
        empresa:         limpar(item.source?.['#text'] || item.source || 'Não informado'),
        cidade:          cidade.nome,
        uf:              cidade.uf,
        descricao:       limpar((item.description || '').replace(/<[^>]+>/g, '')).slice(0, 500),
        link:            item.link || '',
        fonte:           'indeed',
        data_publicacao: item.pubDate ? new Date(item.pubDate).toISOString().slice(0, 10) : hoje(),
        hash:            gerarHash('i' + (item.title || '') + cidade.nome + (item.link || '')),
      }))
      .filter(v => v.titulo && v.link);
  } catch (e) {
    console.error(`  [Indeed] ${cidade.nome}/${termo}: ${e.message}`);
    return [];
  }
}

// ── Adzuna API (250 req/dia no plano free) ────────────────────────────────────
async function scraperAdzuna(cidade, termo) {
  const url =
    `https://api.adzuna.com/v1/api/jobs/br/search/1` +
    `?app_id=${ADZUNA_APP_ID}&app_key=${ADZUNA_APP_KEY}` +
    `&results_per_page=50` +
    `&what=${encodeURIComponent(termo)}` +
    `&where=${encodeURIComponent(cidade.adzuna)}` +
    `&content-type=application/json`;
  try {
    const { data } = await axios.get(url, { timeout: 15000 });
    return (data.results || [])
      .map(job => ({
        titulo:          limpar(job.title || ''),
        empresa:         limpar(job.company?.display_name || 'Não informado'),
        cidade:          cidade.nome,
        uf:              cidade.uf,
        descricao:       limpar((job.description || '').slice(0, 500)),
        link:            job.redirect_url || '',
        fonte:           'adzuna',
        data_publicacao: job.created ? job.created.slice(0, 10) : hoje(),
        hash:            gerarHash('a' + (job.id || job.redirect_url || '') + cidade.nome),
      }))
      .filter(v => v.titulo && v.link);
  } catch (e) {
    console.error(`  [Adzuna] ${cidade.nome}/${termo}: ${e.message}`);
    return [];
  }
}

// ── Salvar no Supabase ────────────────────────────────────────────────────────
async function salvarVagas(vagas) {
  if (!vagas.length) return 0;
  if (DRY_RUN) {
    console.log(`  [DRY-RUN] ${vagas.length} vagas (não salvas)`);
    return vagas.length;
  }
  const { error } = await supabase
    .from('vagas')
    .upsert(vagas, { onConflict: 'hash', ignoreDuplicates: true });
  if (error) { console.error('  [Supabase]', error.message); return 0; }
  return vagas.length;
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function limpar(str = '') {
  return str.replace(/\s+/g, ' ').replace(/[^\w\sÀ-ú/&.,():;!?°%-]/g, '').trim();
}
function hoje() { return new Date().toISOString().slice(0, 10); }
function gerarHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  return Math.abs(h).toString(36);
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nVagasSul Scraper — ${new Date().toLocaleString('pt-BR')} ${DRY_RUN ? '[DRY-RUN]' : ''}`);
  let total = 0;
  let adzunaReqs = 0;
  const ADZUNA_LIMIT = 200; // margem de segurança (limite: 250/dia)

  for (const cidade of CIDADES) {
    console.log(`\n${cidade.nome} / ${cidade.uf}`);
    const vagas = [];

    for (const termo of TERMOS) {
      // Indeed RSS — sem limite de requisições
      const indeedVagas = await scraperIndeed(cidade, termo);
      vagas.push(...indeedVagas);
      await sleep(600);

      // Adzuna — controla para não passar o limite diário
      if (adzunaReqs < ADZUNA_LIMIT) {
        const adzunaVagas = await scraperAdzuna(cidade, termo);
        vagas.push(...adzunaVagas);
        adzunaReqs++;
        await sleep(400);
      }
    }

    const unicos = [...new Map(vagas.map(v => [v.hash, v])).values()];
    console.log(`  ${unicos.length} vagas únicas (${adzunaReqs} req Adzuna usadas)`);
    const salvas = await salvarVagas(unicos);
    total += salvas;
    await sleep(1200);
  }

  // Limpar vagas antigas (mais de 60 dias)
  if (!DRY_RUN) {
    const limite = new Date();
    limite.setDate(limite.getDate() - 60);
    const { error } = await supabase
      .from('vagas')
      .delete()
      .lt('data_publicacao', limite.toISOString().slice(0, 10));
    if (!error) console.log('\nVagas antigas removidas (>60 dias)');
  }

  console.log(`\nConcluído — ${total} vagas processadas`);
}

main().catch(console.error);
