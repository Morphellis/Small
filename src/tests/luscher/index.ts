/*
 * Полный цветовой тест Люшера (М. Люшер, 1984/1999; адаптация И. И. Цыганка) — как на psytests.org
 * (luscher/fullcolor.html): ахроматические цвета, два восьмицветовых выбора, попарные сравнения в таблицах 3–7
 * и фигуры. Показатель тревожности считается по второму восьмицветовому выбору.
 */
import { luscherModule } from "../../kinds/luscher";

export default luscherModule({
  id: "luscher",
  title: "Полный цветовой тест Люшера",
  storageKey: "luscher-full-trainer-v1",
  variant: "full"
});
