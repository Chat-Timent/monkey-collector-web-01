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
  eveil   integer NOT NULL DEFAULT 1 CHECK (eveil >= 1),  -- niveau d'éveil (légendaires et mythiques, voir src/data/eveil.json)
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

-- Perks obtenus (src/data/perks.json) et singe qui les porte : un perk par singe au maximum.
CREATE TABLE perks_obtenus (
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  perk      text NOT NULL,
  tier      integer NOT NULL,             -- 1 pour un perk sans tier
  espece    text,                         -- singe qui le porte (null = non équipé)
  obtenu_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, perk, tier),
  UNIQUE (user_id, espece)
);

-- Objets obtenus (src/data/armes.json, src/data/equipements.json), niveau d'objet et singe qui les porte.
CREATE TABLE objets_obtenus (
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type      text NOT NULL CHECK (type IN ('arme', 'equipement')),
  objet     text NOT NULL,
  tier      integer NOT NULL,
  niveau    integer NOT NULL DEFAULT 1,    -- niveau d'objet, monté par les doublons
  doublons  integer NOT NULL DEFAULT 0,    -- doublons accumulés vers le niveau suivant
  espece    text,                          -- singe qui le porte (null = non équipé)
  slot      integer,                       -- emplacement sur ce singe (1 pour une arme, 1 à 3 pour un équipement)
  obtenu_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, type, objet, tier),
  UNIQUE (user_id, type, espece, slot),    -- un seul objet par emplacement et par singe
  CHECK ((espece IS NULL) = (slot IS NULL))
);

-- Donjons de ressources et donjon d'éveil : palier courant et tickets du jour (heure de Paris) par donjon.
CREATE TABLE donjons_progression (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  donjon  text NOT NULL,                       -- 'tirages', 'coins', 'xp', 'armement', 'equipement', 'eveil'
  palier  integer NOT NULL DEFAULT 1,
  tickets integer NOT NULL DEFAULT 2,
  jour    date NOT NULL DEFAULT CURRENT_DATE,  -- jour des tickets ; un jour passé = tickets pleins
  PRIMARY KEY (user_id, donjon)
);

-- Ressources gagnées dans les donjons et dépensées ailleurs (src/data/ressources-joueur.json) :
-- 'essence' (donjon d'éveil, éveil des singes), 'acier' (donjon de l'armement, loterie des armes),
-- 'etoffe' (donjon de l'équipement, loterie des équipements).
CREATE TABLE ressources_joueur (
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ressource text NOT NULL,
  quantite  integer NOT NULL DEFAULT 0 CHECK (quantite >= 0),
  PRIMARY KEY (user_id, ressource)
);

-- Stock de tirages : `tirages_restants` tirages au moment `dernier_reset` (début de la recharge en cours),
-- +1 toutes les 30 s tant que le stock est sous le plafond (voir src/game/quota.js).
CREATE TABLE tirages_etat (
  user_id          uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tirages_restants integer NOT NULL DEFAULT 0,
  dernier_reset    timestamptz NOT NULL DEFAULT now(),
  tirages_bonus    integer NOT NULL DEFAULT 0, -- ancien stock séparé, ajouté au stock à la prochaine écriture
  tirages_sans_rare integer NOT NULL DEFAULT 0 -- tirages d'affilée sans rare ou mieux (nœud Étincelle)
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
  mode       text NOT NULL DEFAULT 'pvp',  -- 'pvp', 'aventure', 'ressource' ou 'eveil'
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
