import fs from "node:fs";

const cheminMonkeys = new URL("../monkeys.json", import.meta.url);

export const SINGES = JSON.parse(fs.readFileSync(cheminMonkeys, "utf8"));
