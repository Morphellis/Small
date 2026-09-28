/*
 * Цветовой тест Люшера как вид теста: краткий (восьмицветовой) и полный вариант на общем экране.
 * Конкретный тест — это LuscherDef (src/tests/luscher8, src/tests/luscher).
 */
import type { TestModule } from "../../app/types";
import type { LuscherDef } from "./types";
import { mountLuscher } from "./view";
import "./luscher.css";

export function luscherModule(def: LuscherDef): TestModule & { luscher: LuscherDef } {
  return { luscher: def, mount: (root, ctx) => mountLuscher(def, root, ctx) };
}
