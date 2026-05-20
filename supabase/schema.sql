-- VagasSul — Schema Supabase
-- Cole no SQL Editor do Supabase e clique em Run

-- Tabela principal de vagas
CREATE TABLE IF NOT EXISTS vagas (
  id              BIGSERIAL PRIMARY KEY,
  hash            TEXT UNIQUE NOT NULL,
  titulo          TEXT NOT NULL,
  empresa         TEXT,
  cidade          TEXT NOT NULL,
  uf              CHAR(2) NOT NULL,
  descricao       TEXT,
  link            TEXT,
  fonte           TEXT NOT NULL DEFAULT 'indeed', -- 'indeed', 'adzuna', 'empresa'
  data_publicacao DATE NOT NULL DEFAULT CURRENT_DATE,
  criado_em       TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance nas buscas
CREATE INDEX IF NOT EXISTS idx_vagas_cidade ON vagas(cidade);
CREATE INDEX IF NOT EXISTS idx_vagas_uf ON vagas(uf);
CREATE INDEX IF NOT EXISTS idx_vagas_fonte ON vagas(fonte);
CREATE INDEX IF NOT EXISTS idx_vagas_data ON vagas(data_publicacao DESC);
CREATE INDEX IF NOT EXISTS idx_vagas_titulo ON vagas USING gin(to_tsvector('portuguese', titulo));

-- View que o site usa (só vagas dos últimos 60 dias)
CREATE OR REPLACE VIEW vagas_recentes AS
  SELECT * FROM vagas
  WHERE data_publicacao >= CURRENT_DATE - INTERVAL '60 days'
  ORDER BY data_publicacao DESC;

-- Segurança: qualquer um pode LER as vagas (site público)
ALTER TABLE vagas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leitura_publica" ON vagas;
CREATE POLICY "leitura_publica" ON vagas
  FOR SELECT USING (true);
