'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {renderSnapshot}=require('../scripts/feedback-snapshot.cjs');
const template='<main><!-- feedback:rating:start -->old rating<!-- feedback:rating:end --><!-- feedback:items:start -->old cards<!-- feedback:items:end --></main>';
const post=(i,extra={})=>({type:'review',name:'Гость '+i,text:'Текст '+i,date:`2026-11-${String(i).padStart(2,'0')}T12:00:00Z`,verified:true,rating:5,email:'a*****b@example.com',...extra});
const render=items=>renderSnapshot(template,{version:2,items});
test('initial HTML includes latest five; rating uses all verified reviews only',()=>{
 const items=Array.from({length:6},(_,i)=>post(i+1,{rating:i===0?1:5}));
 items.push(post(7,{type:'suggestion',rating:1}),post(8,{verified:false,rating:1}));
 const result=render(items);assert.equal(result.ratingCount,6);assert.match(result.html,/>4,3<\/strong>/);
 assert.equal((result.html.match(/class="feedback-entry"/g)||[]).length,5);assert.match(result.html,/Текст 8/);assert.doesNotMatch(result.html,/Текст 1<\/p>/);
});
test('escapes user text and replies; unmasked addresses and private data are not published',()=>{
 const result=render([post(1,{name:'<script>x</script>',text:'<img src=x onerror=alert(1)>',reply:'Спасибо <3',email:'private@example.com',token:'SECRET'})]);
 assert.doesNotMatch(result.html,/<script>|<img|private@example.com|SECRET/);assert.match(result.html,/&lt;img/);assert.match(result.html,/Спасибо &lt;3/);
});
test('only public message types are rendered; hidden and invalid dates are excluded',()=>{
 const result=render([post(1,{hidden:true}),post(2,{type:'question'}),post(3,{date:'invalid'}),post(4)]);
 assert.equal(result.count,1);assert.match(result.html,/Текст 4/);assert.doesNotMatch(result.html,/Текст [123]/);
});
test('replacement removes deleted messages and old rating, including deleting all messages',()=>{
 const initial=render([post(1)]).html;
 const empty=renderSnapshot(initial,{version:2,items:[]});assert.doesNotMatch(empty.html,/Текст 1|5,0/);assert.match(empty.html,/Пока нет подтверждённых оценок/);assert.match(empty.html,/id="feedback-list"[^>]*><\/div>/);
});
test('malformed responses and missing markers fail instead of deploying empty content',()=>{
 assert.throws(()=>renderSnapshot(template,{items:[]}),/Invalid public/);assert.throws(()=>renderSnapshot('<html></html>',{version:2,items:[]}),/markers/);
});
