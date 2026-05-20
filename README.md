# VagasSul — Passo a passo para subir o sistema

## 1. Supabase (banco de dados)
1. Crie conta em https://supabase.com (gratuito)
2. Crie um novo projeto
3. Vá em **SQL Editor**, cole o conteúdo de `supabase/schema.sql` e clique em **Run**
4. Anote em **Settings → API**:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** → `SUPABASE_ANON_KEY`
   - **service_role** → `SUPABASE_SERVICE_KEY`

## 2. GitHub (código + scraper automático)
1. Crie repositório: `github.com/SEU_USUARIO/vagas-sul`
2. Faça upload de todos os arquivos desta pasta
3. Vá em **Settings → Secrets → Actions** e adicione:
   - `SUPABASE_URL` = URL do passo 1
   - `SUPABASE_SERVICE_KEY` = service_role key
   - `ADZUNA_APP_ID` = `9855a269`
   - `ADZUNA_APP_KEY` = `d59961ec9e59e7767d380b082835e672`
4. O scraper roda automaticamente todo **domingo às 03h (Brasília)**
5. Para rodar agora: **Actions → Scraper Semanal → Run workflow**

## 3. Vercel (site público)
1. Crie conta em https://vercel.com (gratuito)
2. Importe o repositório do GitHub
3. Em **Environment Variables** adicione:
   - `SUPABASE_URL` = URL do Supabase
   - `SUPABASE_ANON_KEY` = anon key (leitura pública)
4. Deploy automático a cada push

## 4. Testar o scraper localmente (opcional)
```bash
cd scraper
cp .env.example .env
# Preencha SUPABASE_URL e SUPABASE_SERVICE_KEY no .env
npm install
npm run dry-run    # testa sem salvar no banco
npm start          # roda de verdade
```

## Custo: R$ 0,00
| Serviço | Plano | Limite gratuito |
|---------|-------|-----------------|
| Supabase | Free | 500 MB, 50k req/dia |
| GitHub Actions | Free | 2.000 min/mês |
| Vercel | Hobby | Ilimitado para sites estáticos |
| Adzuna API | Trial | 250 req/dia |
| Indeed RSS | Público | Sem limite |

## Fontes de vagas
- **Indeed RSS** — feed público, sem chave, sem limite
- **Adzuna API** — App ID: `9855a269` (250 req/dia no plano Trial)

## Estrutura
```
Vagas Sul/
├── .github/workflows/scraper.yml   ← GitHub Actions (domingo 03h)
├── scraper/
│   ├── index.js                    ← scraper Indeed RSS + Adzuna
│   ├── package.json
│   └── .env.example
├── site/
│   └── index.html                  ← site completo com mapa
├── supabase/
│   └── schema.sql                  ← cole no SQL Editor
└── README.md
```
