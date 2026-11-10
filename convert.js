import fs from "node:fs";

const rows = JSON.parse(fs.readFileSync("./monkeysdata.json", "utf8"));
const singes = {};

for (const row of rows) {
  const m = JSON.parse(row.value);

  singes[m.name] = {
    id: m.id,
    nom: m.betterName.trim(),
    description: m.description,
    rarete: m.rarity,
    categorie: m.category,
    base: {
      hp: m.stats.base.HP,
      atk: m.stats.base.ATK,
      def: m.stats.base.DEF,
    },
    croissance: {
      hp: m.stats.growth.HP,
      atk: m.stats.growth.ATK,
      def: m.stats.growth.DEF,
    },
  };
}

fs.writeFileSync("./monkeys.json", JSON.stringify(singes, null, 2));
console.log(`${Object.keys(singes).length} singes exportés`);