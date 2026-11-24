'use strict';
// Apply only the feedback change to an exported CURRENT Yandex function.
const fs=require('node:fs');
const path=require('node:path');
const destination=process.argv[2];
if(!destination)throw Error('Usage: node install.cjs /path/to/current-function');
const entry=path.join(destination,'index.js');
const source=fs.readFileSync(entry,'utf8');
const route=/const feedbackRoutes = \{[^\n]+\};/;
if(!route.test(source)||!fs.existsSync(path.join(destination,'telegram.js')))throw Error('Current Teplo function not recognized; nothing changed.');
const updated=source.replace(route,"const feedbackRoutes = {feedback:'list','feedback-submit':'submit','feedback-verify':'verify','feedback-admin':'admin','feedback-moderation':'moderate'};");
new (require('node:vm').Script)(updated);
fs.writeFileSync(entry,updated);
fs.copyFileSync(path.join(__dirname,'feedback.js'),path.join(destination,'feedback.js'));
console.log('Updated feedback.js and feedback routes. Other function files preserved.');
