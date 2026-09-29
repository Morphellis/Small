/*
 * Цветовой тест Люшера как вид теста: краткий (восьмицветовой) и полный вариант на общем экране.
 * Конкретный тест — это LuscherDef (src/tests/luscher8, src/tests/luscher).
 */
import type { TestModule } from "../../app/types";
import type { LuscherDef } from "./types";
import { mountLuscher } from "./view/mount";
import "./luscher.css";

export interface LuscherModule extends TestModule {
  kind: "luscher";
  def: LuscherDef;
}

export function luscherModule(def: LuscherDef): LuscherModule {
  return { kind: "luscher", def, mount: (root, ctx) => mountLuscher(def, root, ctx) };
}

export const isLuscherModule = (m: TestModule): m is LuscherModule => m.kind === "luscher";
