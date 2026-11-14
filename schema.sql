-- Schéma PostgreSQL du jeu (base Supabase).
-- Relevé depuis la base le 2026-11-14 : colonnes, contraintes et index sont ceux en production.
-- Le serveur se connecte directement (rôle propriétaire) : la RLS est activée sans politique,
-- ce qui bloque l'accès via l'API publique Supabase sans gêner le serveur.
--
-- Table présente en base mais pas encore utilisée par le code (travail en cours) :
-- starter_noeuds. Elle n'est pas décrite ici.

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pseudo        text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
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

-- Quota de tirages : tirages restants dans la fenêtre de reset commencée à `dernier_reset`.
-- Une ligne d'une fenêtre passée vaut un quota plein (voir src/game/quota.js).
CREATE TABLE tirages_etat (
  user_id          uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tirages_restants integer NOT NULL DEFAULT 0,
  dernier_reset    timestamptz NOT NULL DEFAULT now()
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
  user_b     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resultat   jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
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

ALTER TABLE users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE starter     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tirages_etat ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipe      ENABLE ROW LEVEL SECURITY;
ALTER TABLE presence    ENABLE ROW LEVEL SECURITY;
ALTER TABLE defis       ENABLE ROW LEVEL SECURITY;
ALTER TABLE combats     ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_global ENABLE ROW LEVEL SECURITY;
