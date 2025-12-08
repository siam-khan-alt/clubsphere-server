const fs = require('fs')
const jsonData = fs.readFileSync('./serviceKeyFirebase.json')

const base64String = Buffer.from(jsonData, 'utf-8').toString('base64')

