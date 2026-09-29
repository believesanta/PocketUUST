import test from 'node:test'
import assert from 'node:assert/strict'
import {readTheme,writeTheme,THEME_KEY} from '../src/shared/theme.ts'

const storage=values=>({getItem:key=>values[key]??null,setItem:(key,value)=>{values[key]=value}})
test('all four themes survive storage; an explicit global choice wins over the old navigation theme',()=>{
  for(const theme of ['light','dark','uunit','pixel']) {
    const values={'pocketuust.navigation.theme.v1':'dark'}
    const store=storage(values)
    assert.equal(writeTheme(theme,store),true)
    assert.equal(readTheme(store),theme)
    assert.equal(values[THEME_KEY],theme)
  }
})
test('the previous navigation theme migrates without enabling an unsupported theme',()=>{
  assert.equal(readTheme(storage({'pocketuust.navigation.theme.v1':'dark'})),'dark')
  assert.equal(readTheme(storage({})),'light')
  assert.equal(readTheme(storage({[THEME_KEY]:'invalid'})),'light')
})
test('denied browser storage cannot prevent theme changes from working in memory',()=>{
  const blocked={getItem(){throw Error('denied')},setItem(){throw Error('denied')}}
  assert.equal(readTheme(blocked),'light')
  assert.equal(writeTheme('uunit',blocked),false)
})
