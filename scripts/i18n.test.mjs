import test from 'node:test'
import assert from 'node:assert/strict'

const saved = new Map()
const root = { lang: 'ru' }
globalThis.window = {
  localStorage: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) },
  addEventListener: () => {},
}
globalThis.document = { documentElement: root, title: '' }
const { getLanguage, setLanguage, getLocale, subscribeLanguage, t, localize, searchable, LANGUAGE_KEY } = await import('../src/shared/i18n/index.ts')

test('Russian is the default and site language updates without a reload', () => {
  assert.equal(getLanguage(), 'ru')
  assert.equal(t('Расписание'), 'Расписание')
  let changes = 0
  const unsubscribe = subscribeLanguage(() => { changes++ })
  setLanguage('en')
  assert.equal(getLanguage(), 'en')
  assert.equal(saved.get(LANGUAGE_KEY), 'en')
  assert.equal(root.lang, 'en')
  assert.equal(getLocale(), 'en-GB')
  assert.equal(t('Расписание'), 'Schedule')
  assert.equal(t('Перейти к содержимому'), 'Skip to content')
  assert.equal(t('Группа № 123'), 'Group #123')
  assert.equal(t('Дойти до пары'), 'Find your classroom')
  assert.equal(t('Собирай кампус-баллы за полезные действия.'), 'Earn campus points for useful activities.')
  assert.equal(t('Корпус 1 · 2 этаж'), 'Building 1 · floor 2')
  assert.equal(t('Корпус 1, 2 этаж. Найдите указатели к лестнице или переходу.'), 'Building 1, floor 2. Follow the signs to the stairs or passage.')
  assert.equal(t('Есть вопрос или идея? Поделитесь.'), 'Have a question or idea? Share it.')
  assert.equal(t('Войди, чтобы копить баллы'), 'Log in to earn points')
  assert.deepEqual(localize(['Учёба', 3, 'Форум']), ['Study', 3, 'Forum'])
  assert.ok(searchable('Библиотека').includes('библиотека'))
  assert.equal(t('Математический анализ'), 'Математический анализ')
  setLanguage('ru')
  assert.equal(changes, 2)
  assert.equal(root.lang, 'ru')
  assert.equal(saved.get(LANGUAGE_KEY), 'ru')
  unsubscribe()
})
