-- Schéma PostgreSQL du jeu (PostgreSQL 17, base locale du Raspberry Pi).
-- Installation : psql "$DATABASE_URL" -f schema.sql  (sur une base vide).
-- Évolutions : migrations additives uniquement (ALTER TABLE ... ADD COLUMN), puis mise à jour ici.

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pseudo        text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  elo           integer NOT NULL DEFAULT 1000  -- classement PVP (voir src/game/elo.js)
);

CREATE TABLE sessions (
  token      text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE TABLE collections (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  espece  text NOT NULL,
  amount  integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, espece)
);

CREATE TABLE starter (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  nom     text NOT NULL,
  niveau  integer NOT NULL DEFAULT 1,
  xp      integer NOT NULL DEFAULT 0,
  coins   integer NOT NULL DEFAULT 0
);

-- Nœuds de l'arbre du starter débloqués par le joueur (identifiants de src/data/skills.json).
CREATE TABLE starter_noeuds (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  noeud   text NOT NULL,
  pris_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, noeud)
);

-- Donjons de ressources : palier courant et tickets du jour (heure de Paris) par donjon.
CREATE TABLE donjons_progression (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  donjon  text NOT NULL,                       -- 'tirages', 'coins', 'xp'
  palier  integer NOT NULL DEFAULT 1,
  tickets integer NOT NULL DEFAULT 2,
  jour    date NOT NULL DEFAULT CURRENT_DATE,  -- jour des tickets ; un jour passé = tickets pleins
  PRIMARY KEY (user_id, donjon)
);

-- Quota de tirages : tirages restants dans la fenêtre de reset commencée à `dernier_reset`.
-- Une ligne d'une fenêtre passée vaut un quota plein (voir src/game/quota.js).
CREATE TABLE tirages_etat (
  user_id          uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tirages_restants integer NOT NULL DEFAULT 0,
  dernier_reset    timestamptz NOT NULL DEFAULT now(),
  tirages_bonus    integer NOT NULL DEFAULT 0  -- stock gagné en Aventure, jamais remis à zéro
);

-- Aventure (donjon endless) : étage courant du joueur (le prochain à battre).
CREATE TABLE aventure (
  user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  etage      integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE equipe (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot    integer NOT NULL CHECK (slot >= 1 AND slot <= 9),
  espece  text NOT NULL,
  PRIMARY KEY (user_id, slot),
  UNIQUE (user_id, espece)
);

CREATE TABLE presence (
  user_id   uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_seen timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE defis (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  de_user    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vers_user  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  statut     text NOT NULL DEFAULT 'en_attente'
             CHECK (statut IN ('en_attente', 'accepte', 'refuse', 'expire')),
  expires_at timestamptz NOT NULL
);
-- Un seul défi en attente par couple (challenger, cible)
CREATE UNIQUE INDEX defi_unique_en_attente ON defis (de_user, vers_user) WHERE statut = 'en_attente';

CREATE TABLE combats (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  defi_id    uuid REFERENCES defis(id) ON DELETE SET NULL,
  user_a     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b     uuid REFERENCES users(id) ON DELETE CASCADE,  -- null en PVE (pas d'adversaire joueur)
  resultat   jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  mode       text NOT NULL DEFAULT 'pvp',  -- 'pvp', 'aventure' ou 'ressource'
  contexte   jsonb                         -- PVE : étage, récompenses obtenues
);

CREATE TABLE messages (
  id         bigserial PRIMARY KEY,
  combat_id  uuid NOT NULL REFERENCES combats(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  texte      text NOT NULL CHECK (char_length(texte) >= 1 AND char_length(texte) <= 200),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_combat_idx ON messages (combat_id, id);

CREATE TABLE chat_global (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  texte      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_global_texte_max CHECK (char_length(texte) <= 200),
  CONSTRAINT chat_global_texte_non_vide CHECK (char_length(btrim(texte)) > 0)
);
