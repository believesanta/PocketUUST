import test from 'node:test'
import assert from 'node:assert/strict'
import { retrieve } from '../src/features/campus/retrieval.ts'

const documents = [
  {
    id: 'route',
    title: 'Как найти аудиторию?',
    text: 'Введите номер корпуса и аудитории в разделе навигации.',
    keywords: ['аудитория', 'кабинет', 'маршрут'],
    sourceUrl: 'https://uust.ru/',
  },
  {
    id: 'stip',
    title: 'Социальная стипендия',
    text: 'Проверьте основания в официальном положении.',
    keywords: ['стипендия', 'социальная', 'выплата'],
  },
  {
    id: 'dorm',
    title: 'Общежития',
    text: 'Контакты администрации доступны на сайте городка.',
    keywords: ['общежитие', 'заселение'],
  },
]
test('retrieval understands Russian word forms and returns source with answer', () => {
  const result = retrieve('Как дойти до кабинета?', documents)
  assert.equal(result[0]?.id, 'route')
  assert.equal(result[0]?.sourceUrl, 'https://uust.ru/')
})
test('unrelated questions do not produce invented answers', () => {
  assert.deepEqual(retrieve('Как приготовить лазанью?', documents), [])
  assert.deepEqual(retrieve('???', documents), [])
})
test('specific topic wins over an incidental word in a paragraph', () => {
  assert.equal(retrieve('социальная стипендия', documents)[0]?.id, 'stip')
})
