/*
 * Восьмицветовой (краткий) тест Люшера: два выбора восьми цветов с перерывом между ними. Как на psytests.org
 * (luscher/8color.html, адаптация И. И. Цыганка). Итоговый показатель тревожности — по второму выбору.
 */
import { luscherModule } from "../../kinds/luscher";

export default luscherModule({
  id: "luscher8",
  title: "Восьмицветовой тест Люшера",
  storageKey: "luscher8-trainer-v1",
  variant: "short"
});
