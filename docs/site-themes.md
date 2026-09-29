# Темы

Оформления: light, dark, uunit, pixel. Переключатель меняет html[data-theme]. Базовые цвета — src/styles.css, оформление главной и пиксельные ограничения — src/shared/Home.css.

Фиолетовый акцент УУНиТ: #4d19cc. Логотип с прозрачным фоном — src/assets/pocket-uust-symbol.png. Press Start 2P используется только в пиксельной теме; файл и SIL Open Font License находятся в src/assets/fonts.

Ключ localStorage: pocketuust.theme.v1. При отсутствии значения учитывается прежний pocketuust.navigation.theme.v1. Допустимые значения обновляются одновременно в shared/theme.ts, index.html и scripts/theme.test.mjs.

QuickAccess находится после содержимого. В главной его заменяют тематические переходы. Смена темы не сбрасывает текущую пару, маршрут или фильтры.
