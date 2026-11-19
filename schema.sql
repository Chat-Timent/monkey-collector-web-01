-- Schéma PostgreSQL du jeu (PostgreSQL 17, base locale du Raspberry Pi).
-- Installation : psql "$DATABASE_URL" -f schema.sql  (sur une base vide).
-- Évolutions : migrations additives uniquement (ALTER TABLE ... ADD COLUMN), puis mise à jour ici.

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pseudo        text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  elo           integer NOT NULL DEFAULT 1000, -- classement PVP (voir src/game/elo.js)
  annonces_lues bigint NOT NULL DEFAULT 0,     -- dernière annonce lue (pastille de la mailbox)
  deck_actif    integer NOT NULL DEFAULT 1 CHECK (deck_actif >= 1 AND deck_actif <= 3) -- deck utilisé en combat
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

-- Objets obtenus (src/data/armes.json, src/data/equipements.json) : un exemplaire unique par ligne, sans niveau
-- (valeurs de son tier), et singe qui le porte. Un même objet peut être porté plusieurs fois.
CREATE TABLE objets_obtenus (
  id        bigserial PRIMARY KEY,
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type      text NOT NULL CHECK (type IN ('arme', 'equipement')),
  objet     text NOT NULL,
  tier      integer NOT NULL,
  niveau    integer NOT NULL DEFAULT 1,    -- inutilisé (anciens niveaux d'objet, ignorés depuis le 2026-11-18)
  doublons  integer NOT NULL DEFAULT 0,    -- inutilisé (anciens doublons, ignorés depuis le 2026-11-18)
  espece    text,                          -- singe qui le porte (null = non équipé)
  slot      integer,                       -- emplacement sur ce singe (1 pour une arme, 1 à 3 pour un équipement)
  obtenu_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, type, espece, slot),    -- un seul objet par emplacement et par singe
  CHECK ((espece IS NULL) = (slot IS NULL))
);
CREATE INDEX objets_obtenus_joueur ON objets_obtenus (user_id, type);

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
-- 'essence' (donjon d'éveil, éveil des singes), 'ticket_arme' (donjon de l'armement, loterie des armes),
-- 'ticket_equipement' (donjon de l'équipement, loterie des équipements), 'cristaux' (démantèlement des objets).
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

-- Série de connexion (cadeau du footer) : dernier jour de la série récupéré (1 à 7, 0 = jamais)
-- et sa date, heure de Paris (voir src/game/quotidien.js).
CREATE TABLE serie_connexion (
  user_id      uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  jour         integer NOT NULL DEFAULT 0,
  dernier_jour date
);

-- Quêtes du jour (parchemin du footer) : progression et récompense récupérée, par joueur,
-- jour (heure de Paris) et quête de src/data/quotidien.json. La quête 'bonus' note le bonus des trois quêtes.
CREATE TABLE quetes_jour (
  user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  jour     date NOT NULL,
  quete    text NOT NULL,
  progres  integer NOT NULL DEFAULT 0,
  reclamee boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, jour, quete)
);

-- Équipes du joueur : 3 decks (src/constants/game.js NB_DECKS), le deck actif (users.deck_actif) sert en combat.
CREATE TABLE equipe (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot    integer NOT NULL CHECK (slot >= 1 AND slot <= 9),
  espece  text NOT NULL,
  deck    integer NOT NULL DEFAULT 1 CHECK (deck >= 1 AND deck <= 3),
  CONSTRAINT equipe_pkey PRIMARY KEY (user_id, deck, slot),
  CONSTRAINT equipe_deck_espece_key UNIQUE (user_id, deck, espece)
);

-- Noms donnés par les joueurs à leurs decks (une ligne seulement pour un deck renommé)
CREATE TABLE decks (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck    integer NOT NULL CHECK (deck >= 1 AND deck <= 3),
  nom     text NOT NULL CHECK (char_length(nom) >= 1 AND char_length(nom) <= 20),
  PRIMARY KEY (user_id, deck)
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

-- Flux public des tirages notables (légendaires et mythiques), affiché sur la page Tirage.
CREATE TABLE tirages_notables (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  espece     text NOT NULL,
  rarete     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tirages_notables_recents_idx ON tirages_notables (created_at DESC, id DESC);

-- Annonces publiées par l'admin dans la mailbox du footer (voir src/services/annonces-service.js).
CREATE TABLE annonces (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  texte      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT annonces_texte_max CHECK (char_length(texte) <= 500),
  CONSTRAINT annonces_texte_non_vide CHECK (char_length(btrim(texte)) > 0)
);

-- Auto-tirage de la page Tirage (voir src/services/tirage-auto-service.js).
CREATE TABLE tirage_auto (
  user_id         uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  actif           boolean NOT NULL DEFAULT false,
  rythme          integer NOT NULL DEFAULT 1,      -- tirages par seconde
  rarete_min      text NOT NULL DEFAULT 'rare',    -- s'arrête sur cette rareté ou mieux
  dernier_passage timestamptz NOT NULL DEFAULT now(), -- instant du dernier tirage auto effectué
  nb_faits        integer NOT NULL DEFAULT 0,      -- tirages faits depuis le lancement
  raison_arret    text,                            -- 'filtre', 'stock' ou 'manuel'
  espece_arret    text,                            -- singe qui a déclenché l'arrêt (raison 'filtre')
  arret_at        timestamptz
);
