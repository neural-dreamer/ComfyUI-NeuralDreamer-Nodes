# Neural Dreamer Nodes 1.2.0

Three new prompt builders, two image utilities, interface languages for the builders and an Edit mode for the Character Builder.

## New nodes

- **ND Outfit Builder** - outfit description by slot (head, top, outerwear, one-piece, bottom, underwear, legwear, footwear, gloves, accessories) with up to three styles, a wearer, a palette and item states. Feeds the Character Builder.
- **ND Pose Builder** - pose description for one character. Simple mode with categories of ready-made poses and quick settings, Advanced mode with every part of the body. Adult content is behind an Explicit option (off by default).
- **ND Composition Settings** - camera, lens and placement. One shot, or a collage of up to 8 panels on a canvas (character sheet, turnaround, grids) with layout templates. Takes several Pose Builders, follows the pose (views that contradict it are hidden) and can read the size from ND Resolution.
- **ND Resolution** - image size from an aspect ratio and one number (megapixels, long side or short side), rounded to a multiple of 8 / 16 / 32 / 64.
- **ND Batch Images** - joins images into one batch, fitting them to the size of the first with the Keep Proportion modes of ND Load Images. Pins grow as you connect them.

## Changes

- **ND Character Builder**: Edit mode (instructions for image-editing models, Add / Replace / Remove per part), an Outfit input that hides what the clothes cover, an Extra prompt field, race attributes that can be switched off, the `Full Description` output (was `Description`) and the `Character Builder Out` output for the Pose Builder.
- **Interface languages** for all four builders: English, Russian and Chinese, with translated hover texts. One setting for all nodes, with a per-node override.
- **ND Load Images**: values are cached per output (changing a slider or one block no longer re-runs everything after the node), an eye button in each block shows the final image, images can be dropped from ND Variant Preview Selector or from a URL.
- **ND Variant Preview Selector**: optional Preview with Metadata; images can be dragged out of the node.
- **ND Show Any As Text**: a scrollable tab strip with arrows and a Copy button.
- Pack / Unpack Parameters: pins that grow with the connections, wire colors for the new bundle types.

## Upgrade notes

- The Character Builder output `Description` is now `Full Description`; reconnect it if an old workflow used it.
- Some dark skin tones of the Character Builder are now the plain color with the *Darker* shade; old workflows are converted when they open.
- No new Python dependencies.

---

# Neural Dreamer Nodes 1.2.0 (RU)

Три новых билдера промптов, две утилиты для изображений, языки интерфейса для билдеров и режим Edit в Character Builder.

## Новые ноды

- **ND Outfit Builder** - описание наряда по слотам (голова, верх, верхняя одежда, цельная одежда, низ, бельё, чулочные изделия, обувь, перчатки, аксессуары) с тремя стилями, носителем, палитрой и состояниями вещей. Передаёт наряд в Character Builder.
- **ND Pose Builder** - описание позы для одного персонажа. Режим Simple с категориями готовых поз и быстрыми настройками, режим Advanced с каждой частью тела. Контент для взрослых за опцией Explicit (по умолчанию выключено).
- **ND Composition Settings** - камера, объектив и размещение. Один кадр или коллаж до 8 панелей на холсте (character sheet, turnaround, сетки) с шаблонами раскладки. Принимает несколько Pose Builder, следует за позой (противоречащие ей виды скрываются) и может брать размер из ND Resolution.
- **ND Resolution** - размер изображения по соотношению сторон и одному числу (мегапиксели, длинная или короткая сторона) с округлением до кратного 8 / 16 / 32 / 64.
- **ND Batch Images** - собирает изображения в один батч, подгоняя под размер первого режимами Keep Proportion из ND Load Images. Пины растут по мере подключения.

## Изменения

- **ND Character Builder**: режим Edit (инструкции для моделей редактирования, Add / Replace / Remove для каждой части), вход Outfit, скрывающий то, что закрыто одеждой, поле Extra prompt, отключаемые признаки расы, выход `Full Description` (раньше `Description`) и выход `Character Builder Out` для Pose Builder.
- **Языки интерфейса** для всех четырёх билдеров: английский, русский и китайский, с переведёнными подсказками. Одна настройка для всех нод и переопределение для отдельной.
- **ND Load Images**: значения кэшируются по каждому выходу (изменение ползунка или одного блока больше не перезапускает всё после ноды), в каждом блоке кнопка-глаз показывает итоговое изображение, на блок можно перетащить изображение из ND Variant Preview Selector или по URL.
- **ND Variant Preview Selector**: необязательный Preview with Metadata; изображения можно перетаскивать из ноды.
- **ND Show Any As Text**: прокручиваемая полоса вкладок со стрелками и кнопка Copy.
- Pack / Unpack Parameters: пины, которые растут по мере подключения, цвета проводов для новых типов бандлов.

## Заметки по обновлению

- Выход Character Builder `Description` теперь называется `Full Description`; если старый workflow его использовал, подключите заново.
- Тёмные оттенки некоторых цветов кожи в Character Builder теперь обычный цвет с оттенком *Darker*; старые workflow конвертируются при открытии.
- Новых Python-зависимостей нет.
