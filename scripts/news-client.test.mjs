import test from 'node:test'
import assert from 'node:assert/strict'
import { parseNewsPayload } from '../src/features/student-life/news-client.ts'
const news={id:'test',title:'Новость',summary:'Текст',group:'СМИ',tags:['Кампус'],sourceName:'Источник',sourceUrl:'https://uust.ru/news/',checkedAt:null,publishedAt:null,image:'/news-assets/news-1234567890abcdef.jpg'}
test('runtime feed accepts fresh news and rejects empty, invalid dates, unsafe links/photos',()=>{
  const payload={news:[news],newsFetchedAt:'2026-09-26T12:00:00.000Z',stale:false}
  assert.equal(parseNewsPayload(payload).news[0].title,'Новость')
  for(const value of [{...payload,news:[]},{...payload,newsFetchedAt:'bad'},{...payload,news:[{...news,sourceUrl:'javascript:alert(1)'}]},{...payload,news:[{...news,image:'/private/secret.jpg'}]},{...payload,news:[{...news,publishedAt:'bad'}]},{...payload,news:[news,news]}]) assert.equal(parseNewsPayload(value),null)
})
